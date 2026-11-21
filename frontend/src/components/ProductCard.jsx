import React from "react";
import { Check, Package, Plus } from "lucide-react";

export default function ProductCard({ product, quantityInCart, onAddToCart }) {
  const outOfStock = product.stock <= 0;
  const reachedMax = quantityInCart >= product.stock;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
        <img
          src={product.image_url || "/products/laptop-pro.svg"}
          alt={product.name}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">
          {product.category}
        </span>
        <span
          className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur ${
            outOfStock
              ? "bg-rose-100/95 text-rose-700"
              : product.stock <= 10
              ? "bg-amber-100/95 text-amber-800"
              : "bg-emerald-100/95 text-emerald-700"
          }`}
        >
          <Package className="h-3 w-3" />
          {outOfStock ? "Agotado" : `${product.stock} disp.`}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-bold text-slate-900 line-clamp-1">
          {product.name}
        </h3>
        <p className="mt-1.5 flex-1 text-sm text-slate-600 line-clamp-2">
          {product.description}
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div>
            <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Precio
            </span>
            <span className="text-xl font-extrabold text-slate-900">
              ${Number(product.price).toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            disabled={outOfStock || reachedMax}
            onClick={() => onAddToCart(product)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              outOfStock || reachedMax
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : quantityInCart > 0
                ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
                : "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
            }`}
          >
            {outOfStock ? (
              "Sin stock"
            ) : reachedMax ? (
              <>
                <Check className="h-4 w-4" />
                Máx ({quantityInCart})
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                {quantityInCart > 0 ? `Agregar (${quantityInCart})` : "Agregar al carrito"}
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
