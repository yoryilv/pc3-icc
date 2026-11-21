# Documentación Técnica de Arquitectura (`docs/ARQUITECTURA.md`)

Este documento describe en detalle la topología de contenedores, los contratos de la API REST (OpenAPI/Swagger), el diseño de tablas en **Amazon DynamoDB**, el flujo de mensajería en **Amazon SQS** y la gestión de objetos en **Amazon S3** sobre **LocalStack**.

---

## 1. Topología de Red y Comunicación entre Servicios

Todos los servicios ejecutan dentro de la red Docker bridge `ecommerce-net`:

1. **`ecommerce-localstack` (`localstack/localstack:3.8`)**:
   - Expone el gateway unificado en `:4566`.
   - Servicios activos: `dynamodb`, `s3`, `sqs`.
   - Ejecuta `/etc/localstack/init/ready.d/init-aws.sh` al iniciar, creando las tablas, el bucket S3 con su política pública/CORS, la cola SQS y los datos semilla, finalizando con `/tmp/localstack-init-done` para habilitar el `healthcheck`.
2. **`ecommerce-backend` (Python 3.11 + FastAPI)**:
   - Se comunica con LocalStack usando la resolución DNS interna de Docker: `AWS_ENDPOINT_URL=http://localstack:4566`.
   - Emite URLs públicas de S3 usando `S3_PUBLIC_ENDPOINT_URL=http://localhost:4566` para que el navegador del usuario en Windows/WSL2 pueda renderizar las imágenes directamente.
3. **`ecommerce-frontend` (React + Vite + Nginx)**:
   - Compilado con `VITE_API_URL=http://localhost:8000` y servido por Nginx en el puerto `:5173`.

---

## 2. Especificación de Endpoints API REST (Swagger / OpenAPI)

La especificación interactiva completa se genera automáticamente en:
- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`
- **Esquema OpenAPI JSON:** `http://localhost:8000/openapi.json`

### 2.1 Sistema

| Método | Ruta | Auth | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Pública | Verifica conectividad real contra DynamoDB (`list_tables`), S3 (`head_bucket`) y SQS (`get_queue_url`). |

### 2.2 Autenticación (`/api/auth`)

| Método | Ruta | Auth | Content-Type | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Pública | `multipart/form-data` | Campos: `username`, `email`, `password`, `avatar` (archivo opcional). Verifica unicidad en GSI `email-index`, sube avatar a S3 si se incluye y crea usuario `customer` en `Users`. Retorna `201` con `AuthResponse` (`access_token`, `user`). |
| `POST` | `/api/auth/login` | Pública | `application/json` | Body: `{ "email", "password" }`. Verifica hash PBKDF2-HMAC-SHA256 y emite JWT HS256. |
| `GET` | `/api/auth/me` | Bearer JWT | — | Retorna el perfil actualizado desde DynamoDB del usuario autenticado. |

### 2.3 Usuarios y Perfil S3 (`/api/users`)

| Método | Ruta | Auth | Content-Type | Descripción |
| :--- | :--- | :--- | :--- | :--- |
| `PUT` | `/api/users/profile` | Bearer JWT | `multipart/form-data` | Campos opcionales: `username`, `avatar`. Sube la nueva imagen a `user-avatars-bucket`, actualiza `avatar_url` / `username` en DynamoDB `Users` y retorna `UserResponse`. |
| `GET` | `/api/users` | Admin JWT | — | Lista todos los usuarios registrados sin exponer `password_hash`. |

### 2.4 Catálogo de Productos (`/api/products`)

| Método | Ruta | Auth | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Pública | Lista productos desde DynamoDB `Products`. Parámetros query opcionales: `search` (nombre/descripción/categoría) y `category`. |
| `GET` | `/api/products/{product_id}` | Pública | Obtiene el detalle de un producto específico (`404` si no existe). |
| `POST` | `/api/products` | Admin JWT | Crea un producto nuevo con ID `prod-<8hex>` en DynamoDB (`201`). |
| `PUT` | `/api/products/{product_id}` | Admin JWT | Actualiza parcialmente los atributos enviados en DynamoDB usando `ExpressionAttributeNames`. |
| `DELETE` | `/api/products/{product_id}` | Admin JWT | Elimina un producto por su `product_id`. |

### 2.5 Pedidos y Checkout SQS (`/api/orders`)

| Método | Ruta | Auth | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/orders` | Opcional JWT | Valida inventario en `Products`, descuenta stock atómicamente (`ConditionExpression="stock >= :qty"`), calcula totales en servidor, publica mensaje JSON en SQS `orders-queue` y guarda el pedido en `Orders` con `status="QUEUED"` y `sqs_message_id` (`201`). |
| `GET` | `/api/orders/me` | Bearer JWT | Retorna los pedidos asociados al `user_id` autenticado ordenados descendentemente por `created_at`. |
| `GET` | `/api/orders` | Admin JWT | Retorna todos los pedidos en DynamoDB `Orders`. Soporta filtro `?status=QUEUED` o `?status=PROCESSED`. |

### 2.6 Administración y Worker SQS (`/api/admin`)

| Método | Ruta | Auth | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/sqs/metrics` | Admin JWT | Consulta `sqs.get_queue_attributes` (`ApproximateNumberOfMessages`, `ApproximateNumberOfMessagesNotVisible`, `ApproximateNumberOfMessagesDelayed`) y agrega resumen de `Orders` (`total`, `queued`, `processed`, `total_revenue`). |
| `POST` | `/api/admin/sqs/process` | Admin JWT | Query `max_messages` (`1..500`, default `10`). Consume mensajes en lotes de hasta 10 desde `orders-queue`, marca cada pedido como `PROCESSED` (`processed_at`) en DynamoDB `Orders` y elimina el mensaje de SQS (`delete_message`). |

---

## 3. Esquema de Tablas en Amazon DynamoDB

Todas las tablas operan en modo de capacidad bajo demanda (`PAY_PER_REQUEST`).

### 3.1 Tabla `Users`
- **Partition Key (PK):** `user_id` (`S`)
- **Global Secondary Index (GSI):** `email-index` sobre `email` (`S`), proyección `ALL` (búsquedas O(1) en login y validación de registro sin `Scan`).
- **Atributos:**
  - `user_id` (`S`): Ej. `"admin-001"`, `"usr-a1b2c3d4e5"`
  - `username` (`S`)
  - `email` (`S`): normalizado en minúsculas
  - `password_hash` (`S`): formato `pbkdf2_sha256$260000$<salt_hex>$<hash_hex>`
  - `role` (`S`): `"admin"` o `"customer"`
  - `avatar_url` (`S` | `NULL`): URL pública hacia LocalStack S3
  - `created_at` (`S`): ISO-8601 UTC (`...Z`)
  - `updated_at` (`S`, opcional)

### 3.2 Tabla `Products`
- **Partition Key (PK):** `product_id` (`S`)
- **Atributos:**
  - `product_id` (`S`): Ej. `"prod-001"`
  - `name` (`S`)
  - `description` (`S`)
  - `price` (`N`): almacenado como `Decimal`
  - `stock` (`N`): entero no negativo
  - `category` (`S`)
  - `image_url` (`S`)
  - `created_at` (`S`), `updated_at` (`S`)

### 3.3 Tabla `Orders`
- **Partition Key (PK):** `order_id` (`S`)
- **Atributos:**
  - `order_id` (`S`): Ej. `"ord-9f8e7d6c5b"` o `"ord-sim-001-a1b2c3"`
  - `user_id` (`S`): ID del usuario o `"guest-..."` / `"sim-user-..."`
  - `customer_name` (`S`)
  - `items` (`L` de `M`): lista de `{ product_id, name, unit_price, quantity, subtotal }`
  - `total_amount` (`N`)
  - `status` (`S`): `"QUEUED"` | `"PROCESSED"`
  - `sqs_message_id` (`S`): identificador retornado por SQS al publicar el mensaje
  - `created_at` (`S`)
  - `processed_at` (`S` | `NULL`)

### Consideraciones de Implementación DynamoDB (`backend/app/utils/dynamodb.py`)
- **Conversión numérica:** `boto3` rechaza tipos `float` nativos de Python; `to_dynamodb()` convierte recursivamente `float -> Decimal(str(value))` antes de escribir y `from_dynamodb()` restaura `Decimal -> int | float` al serializar respuestas JSON.
- **Palabras reservadas:** `build_update_expression()` parametriza todos los nombres de atributos (`#attr_0`, `#attr_1`, ...) evitando errores con palabras reservadas como `status`, `name`, `role` o `username`.
- **Paginación:** `scan_all()` itera sobre `LastEvaluatedKey` garantizando lecturas completas incluso cuando existen cientos de pedidos simulados.

---

## 4. Flujo de Mensajería Asíncrona con Amazon SQS

- **Nombre de la cola:** `orders-queue` (cola estándar)
- **Atributos:** `VisibilityTimeout=30`, `MessageRetentionPeriod=86400`

### Formato del Mensaje JSON Publicado en SQS

```json
{
  "order_id": "ord-4a7b91c02e",
  "user_id": "usr-88c1a2d3f4",
  "customer_name": "Carlos Mendoza",
  "items": [
    {
      "product_id": "prod-001",
      "name": "Laptop CloudBook Pro 16\"",
      "unit_price": 1499.99,
      "quantity": 1,
      "subtotal": 1499.99
    }
  ],
  "total_amount": 1499.99,
  "timestamp": "2026-11-21T12:30:00.123456Z"
}
```

### Ciclo de Vida del Pedido
1. **Checkout (`POST /api/orders`) o Simulador (`simulate_orders.py`):**
   - Publica el JSON anterior en `orders-queue` y obtiene el `MessageId`.
   - Persiste el pedido en `Orders` con `status = "QUEUED"`.
2. **Observabilidad (`GET /api/admin/sqs/metrics`):**
   - Consulta `ApproximateNumberOfMessages` (visibles) y `ApproximateNumberOfMessagesNotVisible` (en vuelo) en tiempo real.
3. **Procesamiento Worker (`POST /api/admin/sqs/process`):**
   - Ejecutado bajo demanda desde el **Panel de Administración** para preservar la visibilidad de la cola tras simular cargas.
   - Llama `receive_message(MaxNumberOfMessages=10, WaitTimeSeconds=1, VisibilityTimeout=30)` en bucle.
   - Actualiza en DynamoDB `Orders`: `status = "PROCESSED"` y `processed_at = <UTC ISO>`. Si un mensaje huérfano proviene de SQS sin registro previo en `Orders`, realiza un registro completo de respaldo.
   - Confirma el procesamiento eliminando el mensaje con `delete_message`.

---

## 5. Manejo de Almacenamiento de Objetos en Amazon S3

- **Bucket:** `user-avatars-bucket`
- **Configuración de Seguridad Local:**
  - Bloqueo de acceso público desactivado (`delete-public-access-block`).
  - Política de bucket (`PutBucketPolicy`) otorgando `s3:GetObject` público sobre `arn:aws:s3:::user-avatars-bucket/*`.
  - Reglas CORS abiertas (`GET`, `PUT`, `POST`, `HEAD` desde `*`).
- **Path-Style Addressing:** El cliente `boto3` S3 se configura con `Config(s3={"addressing_style": "path"})` para evitar resolución DNS basada en subdominios (`user-avatars-bucket.localstack`), operando siempre sobre `http://localstack:4566/user-avatars-bucket/...`.
- **Validaciones en Subida (`upload_avatar_to_s3`):**
  - Tipos MIME permitidos: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml`.
  - Tamaño máximo: **5 MB**.
  - Clave de objeto: `avatars/<user_id>/<uuid4_hex>.<ext>` con cabecera `CacheControl: public, max-age=31536000`.
  - URL almacenada en DynamoDB `Users`: `http://localhost:4566/user-avatars-bucket/avatars/<user_id>/<uuid4_hex>.<ext>`, directamente renderizable por el navegador en `<img src={user.avatar_url} />`.

---

## 6. Simulador de Carga (`scripts/simulate_orders.py`)

El script independiente utiliza `boto3` apuntando directamente a `http://localhost:4566`:
- **Eficiencia de envío SQS:** Agrupa los 100 mensajes en bloques de 10 invocando `sqs.send_message_batch()` (10 peticiones HTTP en lugar de 100).
- **Eficiencia de escritura DynamoDB:** Usa `table.batch_writer()` para registrar los 100 pedidos con `status="QUEUED"` y el `sqs_message_id` real devuelto por LocalStack.
- **Verificación final:** Ejecuta `sqs.get_queue_attributes()` y despliega en consola el reporte con todos los `MessageId`s, duración total y tasa de procesamiento.
