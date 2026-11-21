#!/usr/bin/env bash
set -euo pipefail

export AWS_DEFAULT_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="test"
export AWS_SECRET_ACCESS_KEY="test"

echo "================================================================="
echo "[init-aws] Iniciando provisionamiento de LocalStack (DynamoDB, S3, SQS)..."
echo "================================================================="

# -----------------------------------------------------------------
# 1. Tablas en DynamoDB (idempotente)
# -----------------------------------------------------------------
if awslocal dynamodb describe-table --table-name Users >/dev/null 2>&1; then
  echo "[init-aws] Tabla DynamoDB 'Users' ya existe."
else
  echo "[init-aws] Creando tabla DynamoDB 'Users' con GSI 'email-index'..."
  awslocal dynamodb create-table \
    --table-name Users \
    --attribute-definitions \
      AttributeName=user_id,AttributeType=S \
      AttributeName=email,AttributeType=S \
    --key-schema AttributeName=user_id,KeyType=HASH \
    --global-secondary-indexes '[
      {
        "IndexName": "email-index",
        "KeySchema": [{"AttributeName": "email", "KeyType": "HASH"}],
        "Projection": {"ProjectionType": "ALL"}
      }
    ]' \
    --billing-mode PAY_PER_REQUEST >/dev/null
  awslocal dynamodb wait table-exists --table-name Users
fi

if awslocal dynamodb describe-table --table-name Products >/dev/null 2>&1; then
  echo "[init-aws] Tabla DynamoDB 'Products' ya existe."
else
  echo "[init-aws] Creando tabla DynamoDB 'Products'..."
  awslocal dynamodb create-table \
    --table-name Products \
    --attribute-definitions AttributeName=product_id,AttributeType=S \
    --key-schema AttributeName=product_id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST >/dev/null
  awslocal dynamodb wait table-exists --table-name Products
fi

if awslocal dynamodb describe-table --table-name Orders >/dev/null 2>&1; then
  echo "[init-aws] Tabla DynamoDB 'Orders' ya existe."
else
  echo "[init-aws] Creando tabla DynamoDB 'Orders'..."
  awslocal dynamodb create-table \
    --table-name Orders \
    --attribute-definitions AttributeName=order_id,AttributeType=S \
    --key-schema AttributeName=order_id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST >/dev/null
  awslocal dynamodb wait table-exists --table-name Orders
fi

# -----------------------------------------------------------------
# 2. Bucket S3 local con lectura pública y CORS
# -----------------------------------------------------------------
BUCKET_NAME="user-avatars-bucket"
if awslocal s3api head-bucket --bucket "${BUCKET_NAME}" >/dev/null 2>&1; then
  echo "[init-aws] Bucket S3 '${BUCKET_NAME}' ya existe."
else
  echo "[init-aws] Creando bucket S3 '${BUCKET_NAME}'..."
  awslocal s3api create-bucket --bucket "${BUCKET_NAME}" >/dev/null
fi

awslocal s3api delete-public-access-block --bucket "${BUCKET_NAME}" >/dev/null 2>&1 || true

cat <<'EOF' > /tmp/s3-bucket-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::user-avatars-bucket/*"
    }
  ]
}
EOF
awslocal s3api put-bucket-policy --bucket "${BUCKET_NAME}" --policy file:///tmp/s3-bucket-policy.json

cat <<'EOF' > /tmp/s3-cors.json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF
awslocal s3api put-bucket-cors --bucket "${BUCKET_NAME}" --cors-configuration file:///tmp/s3-cors.json

# Avatar inicial del administrador en S3
cat <<'EOF' > /tmp/admin-avatar.svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#bg)"/>
  <circle cx="64" cy="48" r="22" fill="#ffffff" fill-opacity="0.95"/>
  <path d="M26 108c4-22 20-34 38-34s34 12 38 34" fill="#ffffff" fill-opacity="0.95"/>
  <circle cx="98" cy="96" r="16" fill="#0f172a"/>
  <path d="M98 86l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" fill="#fbbf24"/>
</svg>
EOF
awslocal s3 cp /tmp/admin-avatar.svg "s3://${BUCKET_NAME}/avatars/admin-avatar.svg" \
  --content-type "image/svg+xml" >/dev/null

# -----------------------------------------------------------------
# 3. Usuario Administrador Precargado (admin@store.local / Admin123!)
# -----------------------------------------------------------------
echo "[init-aws] Insertando usuario administrador 'admin@store.local'..."
cat <<'EOF' > /tmp/seed-admin.json
{
  "user_id": {"S": "admin-001"},
  "username": {"S": "Admin Principal"},
  "email": {"S": "admin@store.local"},
  "password_hash": {"S": "pbkdf2_sha256$260000$7a9f3e2b1c4d8e6f0a5b2c9d1e4f7a8b$1161aa27690e2ab464f017e45316fa8cdc27534d03c45a8d7a886b6422f77df1"},
  "role": {"S": "admin"},
  "avatar_url": {"S": "http://localhost:4566/user-avatars-bucket/avatars/admin-avatar.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF
awslocal dynamodb put-item --table-name Users --item file:///tmp/seed-admin.json

# -----------------------------------------------------------------
# 4. Catálogo Inicial (10 Productos en DynamoDB)
# -----------------------------------------------------------------
echo "[init-aws] Precargando 10 productos iniciales en DynamoDB 'Products'..."

cat <<'EOF' > /tmp/prod-001.json
{
  "product_id": {"S": "prod-001"},
  "name": {"S": "Laptop CloudBook Pro 16\""},
  "description": {"S": "Estación de trabajo ultraligera con procesador 12-Core, 32GB RAM unificada, SSD NVMe 1TB y pantalla Liquid Retina XDR."},
  "price": {"N": "1499.99"},
  "stock": {"N": "35"},
  "category": {"S": "Laptops"},
  "image_url": {"S": "/products/laptop-pro.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

cat <<'EOF' > /tmp/prod-002.json
{
  "product_id": {"S": "prod-002"},
  "name": {"S": "Audífonos Studio ANC Pro"},
  "description": {"S": "Cancelación activa de ruido híbrida, audio espacial de alta resolución, Bluetooth 5.3 multipunto y 45 horas de batería."},
  "price": {"N": "279.99"},
  "stock": {"N": "60"},
  "category": {"S": "Audio"},
  "image_url": {"S": "/products/headphones-anc.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

cat <<'EOF' > /tmp/prod-003.json
{
  "product_id": {"S": "prod-003"},
  "name": {"S": "Teclado Mecánico RGB 75%"},
  "description": {"S": "Chasis de aluminio CNC, switches táctiles hot-swap lubricados de fábrica, keycaps PBT doble inyección y conectividad trimodo."},
  "price": {"N": "139.50"},
  "stock": {"N": "80"},
  "category": {"S": "Periféricos"},
  "image_url": {"S": "/products/keyboard-mech.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

cat <<'EOF' > /tmp/prod-004.json
{
  "product_id": {"S": "prod-004"},
  "name": {"S": "Mouse Ergonómico Wireless Pro"},
  "description": {"S": "Sensor óptico 26000 DPI de precisión quirúrgica, rueda electromagnética MagSpeed, 8 botones programables y carga USB-C."},
  "price": {"N": "89.99"},
  "stock": {"N": "95"},
  "category": {"S": "Periféricos"},
  "image_url": {"S": "/products/mouse-ergo.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

cat <<'EOF' > /tmp/prod-005.json
{
  "product_id": {"S": "prod-005"},
  "name": {"S": "Monitor UltraSharp 27\" 4K IPS"},
  "description": {"S": "Panel IPS Black 4K UHD (3840x2160), cobertura 98% DCI-P3, hub USB-C con Power Delivery de 90W y soporte ergonómico."},
  "price": {"N": "459.00"},
  "stock": {"N": "40"},
  "category": {"S": "Monitores"},
  "image_url": {"S": "/products/monitor-4k.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

cat <<'EOF' > /tmp/prod-006.json
{
  "product_id": {"S": "prod-006"},
  "name": {"S": "Webcam 4K HDR Auto-Focus"},
  "description": {"S": "Sensor Sony STARVIS 4K a 60fps, encuadre automático por IA, doble micrófono con reducción de ruido y obturador magnético."},
  "price": {"N": "119.00"},
  "stock": {"N": "70"},
  "category": {"S": "Periféricos"},
  "image_url": {"S": "/products/webcam-hd.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

cat <<'EOF' > /tmp/prod-007.json
{
  "product_id": {"S": "prod-007"},
  "name": {"S": "Hub Dock USB-C Thunderbolt 12-en-1"},
  "description": {"S": "Estación de acoplamiento con doble salida HDMI 4K@60Hz, Ethernet 2.5Gbps, lector SD UHS-II, 4x USB 3.2 y carga PD 100W."},
  "price": {"N": "149.99"},
  "stock": {"N": "85"},
  "category": {"S": "Accesorios"},
  "image_url": {"S": "/products/dock-usbc.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

cat <<'EOF' > /tmp/prod-008.json
{
  "product_id": {"S": "prod-008"},
  "name": {"S": "SSD Externo NVMe 2TB USB 3.2"},
  "description": {"S": "Velocidades de transferencia de hasta 2000 MB/s, carcasa disipadora en aluminio aeronáutico con resistencia IP65 y cifrado AES-256."},
  "price": {"N": "189.99"},
  "stock": {"N": "110"},
  "category": {"S": "Almacenamiento"},
  "image_url": {"S": "/products/ssd-nvme.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

cat <<'EOF' > /tmp/prod-009.json
{
  "product_id": {"S": "prod-009"},
  "name": {"S": "Altavoz Inteligente Hi-Fi 360°"},
  "description": {"S": "Acústica omnidireccional de alta fidelidad con woofer de neodimio, calibración automática de sala y Wi-Fi 6 / AirPlay."},
  "price": {"N": "129.00"},
  "stock": {"N": "65"},
  "category": {"S": "Smart Home"},
  "image_url": {"S": "/products/speaker-smart.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

cat <<'EOF' > /tmp/prod-010.json
{
  "product_id": {"S": "prod-010"},
  "name": {"S": "Silla Ergonómica Mesh Executive"},
  "description": {"S": "Malla transpirable de alta tensión, soporte lumbar dinámico 3D, reposabrazos 4D ajustables y base de aluminio pulido."},
  "price": {"N": "389.00"},
  "stock": {"N": "30"},
  "category": {"S": "Mobiliario"},
  "image_url": {"S": "/products/chair-ergo.svg"},
  "created_at": {"S": "2026-01-01T00:00:00Z"}
}
EOF

for idx in 001 002 003 004 005 006 007 008 009 010; do
  awslocal dynamodb put-item --table-name Products --item "file:///tmp/prod-${idx}.json"
done

# -----------------------------------------------------------------
# 5. Cola SQS estándar: orders-queue
# -----------------------------------------------------------------
echo "[init-aws] Creando cola estándar SQS 'orders-queue'..."
awslocal sqs create-queue \
  --queue-name orders-queue \
  --attributes VisibilityTimeout=30,MessageRetentionPeriod=86400 >/dev/null

# -----------------------------------------------------------------
# 6. Bandera de inicialización completa para Docker healthcheck
# -----------------------------------------------------------------
rm -f /tmp/s3-bucket-policy.json /tmp/s3-cors.json /tmp/admin-avatar.svg /tmp/seed-admin.json /tmp/prod-*.json
touch /tmp/localstack-init-done

echo "================================================================="
echo "[init-aws] LocalStack listo: Tablas (Users, Products, Orders),"
echo "           Bucket S3 (user-avatars-bucket) y Cola SQS (orders-queue)."
echo "================================================================="
