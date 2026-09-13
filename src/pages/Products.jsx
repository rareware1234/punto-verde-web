import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext';
import { useEmpresa } from '../context/EmpresaContext';
import { filterByActiveEmpresa } from '../lib/empresaActiva';
import { useCart } from '../context/CartContext';
import { useLocation } from 'react-router-dom';
import productService from '../services/productService';
import cajaService from '../services/cajaService';
import ConfirmModal from '../components/ConfirmModal';
import CategoriaEditorModal from '../components/CategoriaEditorModal';
import marcaStore from '../services/marcaCustomizationStore';
import userCategoriasStore from '../services/userCategoriasStore';
import { resolveCategoriaBrandAsset, assetDataUrl } from '../lib/categoriaBrandIcon';
import { titleColorStyle } from '../lib/brandRoles';
import sinImagen from '../assets/sin-imagen.png';
import logoBlanco from '../assets/logo-blanco.png';
import './Products.css';

// Normaliza el nombre de marca igual que MarcaCustomizationStore (Swift):
// sin acentos, minúsculas, sin espacios extra — para casar con el doc id.
const normalizeMarca = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Iconos de categoría (SVG tomados de los assets de macOS).
const CAT_ICON_URLS = import.meta.glob('../assets/cat-icons/*.svg', {
  eager: true, query: '?url', import: 'default',
});
const catIconUrl = (cat) => {
  const l = (cat || '').toLowerCase();
  let file = 'abarrotes';
  if (l.includes('aceite')) file = 'aceites';
  else if (l.includes('bebé') || l.includes('bebe')) file = 'bebes';
  else if (l.includes('bebida') || l.includes('refresco')) file = 'bebidas';
  else if (l.includes('café') || l.includes('cafe') || l.includes('té')) file = 'cafe_te';
  else if (l.includes('embutido')) file = 'embutidos';
  else if (l.includes('carne')) file = 'carne';
  else if (l.includes('pollo')) file = 'pollo';
  else if (l.includes('pescado') || l.includes('marisco')) file = 'pescado';
  else if (l.includes('cereal')) file = 'cereales';
  else if (l.includes('congelado')) file = 'congelados';
  else if (l.includes('conserva') || l.includes('enlatado')) file = 'conservas';
  else if (l.includes('dulce') || l.includes('chocolate')) file = 'dulces';
  else if (l.includes('especia') || l.includes('condimento')) file = 'especias';
  else if (l.includes('flor')) file = 'flores';
  else if (l.includes('fruta')) file = 'frutas';
  else if (l.includes('verdura') || l.includes('vegetal')) file = 'verduras';
  else if (l.includes('higiene')) file = 'higiene';
  else if (l.includes('huevo')) file = 'huevos';
  else if (l.includes('lacteo') || l.includes('leche') || l.includes('yogurt')) file = 'lacteos';
  else if (l.includes('limp')) file = 'limpieza';
  else if (l.includes('mascota') || l.includes('perro') || l.includes('gato')) file = 'mascotas';
  else if (l.includes('oferta') || l.includes('promo')) file = 'ofertas';
  else if (l.includes('pan')) file = 'panaderia';
  else if (l.includes('salsa')) file = 'salsas';
  else if (l.includes('semilla')) file = 'semillas';
  else if (l.includes('snack') || l.includes('botana')) file = 'snacks';
  else if (l.includes('suplemento') || l.includes('vitamina')) file = 'suplementos';
  else if (l.includes('tortilla')) file = 'tortillas';
  else if (l.includes('vino') || l.includes('licor')) file = 'vinos';
  return CAT_ICON_URLS[`../assets/cat-icons/${file}.svg`] || CAT_ICON_URLS['../assets/cat-icons/abarrotes.svg'] || null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const mxn = (v) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(v || 0);

// Paleta de gradientes seed-based (portada de brandGradient en ProductsView.swift).
const BRAND_GRADIENTS = [
  ['rgb(51,115,217)', 'rgb(26,64,166)'],   // azul
  ['rgb(217,89,140)', 'rgb(153,51,115)'],  // rosa
  ['rgb(51,166,140)', 'rgb(20,102,89)'],   // teal
  ['rgb(242,140,51)', 'rgb(179,77,26)'],   // naranja
  ['rgb(140,89,217)', 'rgb(77,38,166)'],   // violeta
  ['rgb(77,166,77)', 'rgb(26,102,38)'],    // verde
  ['rgb(204,77,77)', 'rgb(140,38,51)'],    // rojo
  ['rgb(89,140,191)', 'rgb(38,77,128)'],   // azul gris
];
const brandGradient = (seed) => {
  const [a, b] = BRAND_GRADIENTS[Math.abs(seed) % BRAND_GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
};

// Descripción evocativa por categoría (portada de categoriaDescripcion en Swift).
const categoriaDescripcion = (cat, count) => {
  const l = (cat || '').toLowerCase();
  if (l.includes('bebida') || l.includes('refresco')) return 'Refrescos, aguas y bebidas para acompañar';
  if (l.includes('limp')) return 'Para mantener todo impecable en casa';
  if (l.includes('snack') || l.includes('botana')) return 'Antojos perfectos para cualquier momento';
  if (l.includes('pan') || l.includes('dulce')) return 'Repostería fresca y dulces favoritos';
  if (l.includes('lacteo') || l.includes('leche')) return 'Lácteos frescos seleccionados del día';
  if (l.includes('fruta') || l.includes('verdura')) return 'Frescos del campo directo a tu mesa';
  if (l.includes('carne') || l.includes('pollo')) return 'Cortes y proteínas de calidad selecta';
  if (l.includes('higiene')) return 'Cuidado personal para tu día a día';
  if (l.includes('hogar')) return 'Esenciales que tu hogar necesita';
  return `${count} producto${count === 1 ? '' : 's'} en esta colección`;
};

function stockStatus(stock, min) {
  if (stock === 0)           return { color: '#EF4444', label: 'Agotado' };
  if (stock <= (min || 5))   return { color: '#F59E0B', label: 'Bajo' };
  return { color: '#10B981', label: `${stock} uds` };
}

function firstImg(product) {
  return product.imagenUrls?.[0] || product.imagenUrl || product.imagen || null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Focus-animated input field — mirrors NuevoCampo from Swift */
function NuevoCampo({ label, placeholder, value, onChange, prefix, suffix, type = 'text', mono }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className={`nc-label${focused ? ' nc-label-focused' : ''}`}>{label}</div>
      <div className={`nc-wrap${focused ? ' nc-wrap-focused' : ''}`}>
        {prefix && <span className="nc-affix">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="nc-input"
          style={mono ? { fontFamily: 'monospace' } : {}}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {suffix && <span className="nc-affix nc-affix-right">{suffix}</span>}
      </div>
    </div>
  );
}

/** Section header with colored icon — mirrors NuevoSeccion from Swift */
function SeccionForm({ iconEl, titulo, color, children }) {
  return (
    <div className="pf-seccion">
      <div className="pf-seccion-header">
        <div className="pf-seccion-icon" style={{ background: `${color}20` }}>
          <span style={{ color, display: 'flex' }}>{iconEl}</span>
        </div>
        <span className="pf-seccion-titulo">{titulo}</span>
      </div>
      <div className="pf-seccion-body">{children}</div>
    </div>
  );
}

/** 8-slot image grid — mirrors imagePickerCard from Swift */
function ImageSlotGrid({ slots, onChange }) {
  const [pickerIdx, setPickerIdx] = useState(null);
  const [tempUrl, setTempUrl] = useState('');
  const inputRef = useRef(null);
  const firstFilled = slots.findIndex(Boolean);

  const openPicker = (idx) => {
    setTempUrl(slots[idx] || '');
    setPickerIdx(idx);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmPicker = () => {
    const next = [...slots];
    next[pickerIdx] = tempUrl.trim();
    onChange(next);
    setPickerIdx(null);
    setTempUrl('');
  };

  const removeSlot = (idx, e) => {
    e.stopPropagation();
    const next = [...slots];
    next[idx] = '';
    onChange(next);
  };

  return (
    <div className="img-picker">
      <div className="img-picker-header">
        <span className="img-picker-title">Fotos del producto</span>
        <span className="img-count-badge">{slots.filter(Boolean).length}/8</span>
      </div>

      <div className="img-grid">
        {slots.map((url, i) => (
          <div
            key={i}
            className={`img-slot${url ? ' img-slot-filled' : ''}${pickerIdx === i ? ' img-slot-active' : ''}`}
            onClick={() => openPicker(i)}
          >
            {url ? (
              <>
                <img
                  src={url}
                  alt=""
                  className="img-slot-img"
                  onError={e => { e.target.style.display = 'none'; }}
                />
                {i === firstFilled && <span className="img-principal-badge">Principal</span>}
                <button className="img-remove-btn" onClick={e => removeSlot(i, e)}>
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="white" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </>
            ) : (
              <div className="img-slot-empty">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {i === 0 && <span>Principal</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {pickerIdx !== null && (
        <div className="img-url-picker">
          <span className="img-url-label">URL de imagen</span>
          <div className="img-url-wrap">
            <input
              ref={inputRef}
              type="url"
              placeholder="https://..."
              value={tempUrl}
              onChange={e => setTempUrl(e.target.value)}
              className="img-url-input"
              onKeyDown={e => { if (e.key === 'Enter') confirmPicker(); if (e.key === 'Escape') { setPickerIdx(null); setTempUrl(''); }}}
            />
            <button className="img-url-btn-ok" onClick={confirmPicker}>OK</button>
            <button className="img-url-btn-cancel" onClick={() => { setPickerIdx(null); setTempUrl(''); }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SVG icons (inline, no import needed) ─────────────────────────────────────

const IconBarcode = (
  <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor">
    <path d="M2 4h2v16H2V4zm3 0h1v16H5V4zm2 0h2v16H7V4zm3 0h1v16h-1V4zm2 0h2v16h-2V4zm3 0h1v16h-1V4zm2 0h2v16h-2V4z"/>
  </svg>
);

const IconClose = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconEdit = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 8.5-8.5z"/>
  </svg>
);

// ── Form initial state ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  nombre: '', codigo: '', precioCompra: '', precioVenta: '',
  stock: '', stockMinimo: '5', categoria: '', proveedor: '',
  slots: ['', '', '', '', '', '', '', ''],
};

// ── Main component ────────────────────────────────────────────────────────────

const Products = () => {
  const { hasPermission, empleado } = useAuth();
  const { activaId, empresaActiva } = useEmpresa();
  const { add } = useCart();
  const [catEditor, setCatEditor] = useState(null); // null | 'new' | categoria(string)
  const location = useLocation();
  const [products, setProducts]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [filterMarca, setFilterMarca]     = useState(location.state?.filterMarca || null);
  const [filterCategoria, setFilterCategoria] = useState(null);
  const [categories, setCategories]       = useState([]);
  const [marcaCustom, setMarcaCustom]     = useState({});
  const [viewMode, setViewMode]           = useState('grid'); // 'grid' | 'list'

  const [showModal, setShowModal]         = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData]           = useState(EMPTY_FORM);

  const [viewingProduct, setViewingProduct] = useState(null);
  const [carouselIdx, setCarouselIdx]     = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast]                 = useState('');
  const [cajaAbierta, setCajaAbierta]     = useState(false);

  const showToast = (msg, ms = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  const canEdit   = hasPermission('productos_editar') || hasPermission('productos_agregar');
  const canDelete = hasPermission('productos_eliminar');

  // External "nuevo producto" trigger (e.g. from sidebar)
  useEffect(() => {
    if (!canEdit) return;
    const handler = () => openNewModal();
    window.addEventListener('open-nuevo-producto', handler);
    return () => window.removeEventListener('open-nuevo-producto', handler);
  }, [canEdit]);

  useEffect(() => {
    const ctrl = new AbortController();
    marcaStore.load(); // hidrata personalizaciones de categoría (íconos, colores, título)
    fetchProducts(ctrl.signal);
    if (empleado?.uid) {
      cajaService.cajaAbierta(empleado.uid).then(r => {
        if (r.success) setCajaAbierta(!!r.data);
      });
    }
    return () => ctrl.abort();
  }, []);

  const fetchProducts = async (signal) => {
    setLoading(true);
    try {
      const [result, customSnap] = await Promise.all([
        productService.fetchAll(),
        getDocs(collection(db, 'marcaCustomizaciones')).catch(() => null),
      ]);
      if (signal?.aborted) return;
      if (result.success) {
        // Filtro multi-tenant por empresa activa (legacy sin empresaId → default).
        const data = filterByActiveEmpresa(result.data, activaId);
        setProducts(data);
        // Lista = userCreated ∪ fromProductos, con defaults si vacío (§9.3).
        const uc = await userCategoriasStore.loadUserCreated(activaId);
        if (!signal?.aborted) {
          setCategories(userCategoriasStore.listCategorias(uc, data, empresaActiva));
        }
      }
      if (customSnap) {
        const map = {};
        customSnap.forEach((d) => {
          const data = d.data();
          map[d.id] = {
            color: (typeof data.r === 'number' && typeof data.g === 'number' && typeof data.b === 'number')
              ? [data.r, data.g, data.b] : null,
            logo: data.logoBase64 || null,
            razonSocial: data.razonSocial || null,
          };
        });
        setMarcaCustom(map);
      }
    } catch (e) {
      console.error('Error cargando productos:', e);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const proveedores = [...new Set(products.map(p => p.proveedor).filter(Boolean))].sort();

  // Estilo de card de marca: gradiente del color de Firebase + logo (o nombre).
  const brandStyle = (prov, seed) => {
    const cust = marcaCustom[normalizeMarca(prov)];
    if (cust?.color) {
      const to255 = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255);
      const [r, g, b] = cust.color;
      const c1 = `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
      const c2 = `rgb(${to255(r - 0.45)}, ${to255(g - 0.45)}, ${to255(b - 0.45)})`;
      return {
        gradient: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
        logo: cust.logo ? `data:image/png;base64,${cust.logo}` : null,
      };
    }
    return { gradient: brandGradient(seed), logo: null };
  };

  // Estilo de card de categoría: color + icono/logo desde Firebase.
  // Las categorías se guardan en `marcaCustomizaciones` con doc id
  // namespaced ("cat::<categoria>" o "caticon::<categoria>").
  const catStyle = (cat, seed) => {
    const base = normalizeMarca(cat);
    const candidates = [
      marcaCustom['cat::' + base],
      marcaCustom['caticon::' + base],
      marcaCustom[base],
    ];
    const colorDoc = candidates.find((c) => c?.color);
    const logoDoc = candidates.find((c) => c?.logo);
    let gradient = brandGradient(seed + 5);
    if (colorDoc?.color) {
      const to255 = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255);
      const [r, g, b] = colorDoc.color;
      const c1 = `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
      const c2 = `rgb(${to255(r - 0.45)}, ${to255(g - 0.45)}, ${to255(b - 0.45)})`;
      gradient = `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
    }
    return { gradient, logo: logoDoc?.logo ? `data:image/png;base64,${logoDoc.logo}` : null };
  };
  // Ícono de marca de una categoría (resolución durable id→nombre→fallback, §8.1):
  // 1) asset de la iconografía de la empresa (enlace por nombre en caticonasset::),
  // 2) fallback al ícono bundled por heurística de nombre.
  const brandCatIcon = (cat) => {
    const link = marcaStore.getCatIconAsset(cat);
    const asset = resolveCategoriaBrandAsset(empresaActiva, cat, link);
    return asset ? assetDataUrl(asset) : (catIconUrl(cat) || catStyle(cat, 0).logo);
  };

  // Estilo del color de título de la categoría (negro/blanco/dorado, §7.3).
  const catTitleStyle = (cat) => {
    const key = marcaStore.getCatTextColor(cat);
    if (!key) return undefined;
    const s = titleColorStyle(empresaActiva, key);
    if (s.kind === 'gradient') return { backgroundImage: s.gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' };
    return { color: s.color };
  };

  const activeFilter = filterMarca || filterCategoria;

  const sortProducts = (list) => [...list].sort((a, b) => {
    if (a.orden != null && b.orden != null) return a.orden - b.orden;
    if (a.orden != null) return -1;
    if (b.orden != null) return 1;
    return (a.nombre || '').localeCompare(b.nombre || '');
  });

  const displayProducts = sortProducts(
    filterMarca ? products.filter(p => p.proveedor === filterMarca)
      : filterCategoria ? products.filter(p => p.categoria === filterCategoria)
        : products
  );

  const countCategoria = (cat) => products.filter(p => p.categoria === cat).length;

  const clearFilter = () => { setFilterMarca(null); setFilterCategoria(null); };

  // ── Render de productos (grid / lista) ───────────────────────────────────
  const renderGrid = (list) => (
    <div className="products-grid">
      {list.map(p => {
        const img = firstImg(p);
        return (
          <div key={p.id} className="pg-card2">
            <div className="pg-card2-img" onClick={() => openDetail(p)}>
              <img src={img || sinImagen} alt={p.nombre} onError={e => { e.target.src = sinImagen; }} />
              <span className="pg-card2-price">{mxn(p.precioVenta)}</span>
              <button
                className="pg-card2-add"
                onClick={(e) => { e.stopPropagation(); if (cajaAbierta) add(p); }}
                disabled={!cajaAbierta}
                title={cajaAbierta ? 'Agregar al carrito' : 'Abre la caja primero'}
                aria-label="Agregar al carrito"
                style={{ opacity: cajaAbierta ? 1 : 0.35, cursor: cajaAbierta ? 'pointer' : 'not-allowed' }}
              >+</button>
            </div>
            <div className="pg-card2-name">{p.nombre}</div>
            <div className="pg-card2-code">{p.codigo || ' '}</div>
          </div>
        );
      })}
    </div>
  );

  const renderList = (list) => (
    <div className="products-list">
      {list.map(p => {
        const img = firstImg(p);
        const ss = stockStatus(p.stock || 0, p.stockMinimo);
        return (
          <div key={p.id} className="pl-row" onClick={() => openDetail(p)}>
            <div className="pl-thumb">
              <img src={img || sinImagen} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} onError={e => { e.target.src = sinImagen; }} />
            </div>
            <div className="pl-info">
              <div className="pl-nombre">{p.nombre}</div>
              <div className="pl-meta">
                {p.codigo && <span style={{ fontFamily: 'monospace' }}>{p.codigo}</span>}
                {p.codigo && p.categoria && <span className="pl-dot">·</span>}
                {p.categoria && <span>{p.categoria}</span>}
              </div>
            </div>
            <div className="pl-right">
              <div className="pl-precio">{mxn(p.precioVenta)}</div>
              <div className="pl-stock-row">
                <span className="pl-stock-dot" style={{ background: ss.color }} />
                <span style={{ color: ss.color, fontSize: 12, fontWeight: 500 }}>{ss.label}</span>
              </div>
            </div>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#D1D5DB" strokeWidth="2.5" style={{ flexShrink: 0 }}>
              <polyline points="9,18 15,12 9,6"/>
            </svg>
          </div>
        );
      })}
    </div>
  );

  const renderProducts = (list) => (viewMode === 'grid' ? renderGrid(list) : renderList(list));

  // ── Form ──────────────────────────────────────────────────────────────────

  const openNewModal = () => {
    setEditingProduct(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (product) => {
    setViewingProduct(null);
    setEditingProduct(product);
    const urls  = product.imagenUrls?.length
      ? product.imagenUrls
      : product.imagenUrl ? [product.imagenUrl] : [];
    const slots = [...urls, ...Array(8).fill('')].slice(0, 8);
    setFormData({
      nombre:       product.nombre       || '',
      codigo:       product.codigo       || '',
      precioCompra: product.precioCompra?.toString() || '',
      precioVenta:  product.precioVenta?.toString()  || '',
      stock:        product.stock?.toString()        || '',
      stockMinimo:  (product.stockMinimo ?? 5).toString(),
      categoria:    product.categoria    || '',
      proveedor:    product.proveedor    || '',
      slots,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.nombre || !formData.precioVenta) {
      showToast('Nombre y precio de venta son requeridos');
      return;
    }
    const finalUrls = formData.slots.filter(Boolean);
    const data = {
      nombre:       formData.nombre.trim(),
      codigo:       formData.codigo.trim(),
      precioCompra: parseFloat(formData.precioCompra) || 0,
      precioVenta:  parseFloat(formData.precioVenta),
      stock:        parseInt(formData.stock)      || 0,
      stockMinimo:  parseInt(formData.stockMinimo) || 5,
      categoria:    formData.categoria.trim(),
      proveedor:    formData.proveedor.trim(),
      imagenUrl:    finalUrls[0] || '',
      imagenUrls:   finalUrls,
    };

    const result = editingProduct
      ? await productService.update(editingProduct.id, data)
      : await productService.create(data);

    if (result.success) {
      setShowModal(false);
      fetchProducts();
      showToast(editingProduct ? 'Producto actualizado' : 'Producto creado');
    } else {
      showToast('Error al guardar: ' + result.error);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await productService.remove(deleteConfirm.id);
    setDeleteConfirm(null);
    fetchProducts();
  };

  // ── Detail ────────────────────────────────────────────────────────────────

  const openDetail = (product) => {
    setViewingProduct(product);
    setCarouselIdx(0);
  };

  // Margin preview for form
  const margenPreview = (() => {
    const c = parseFloat(formData.precioCompra);
    const v = parseFloat(formData.precioVenta);
    if (c > 0 && v > 0) return ((v - c) / c) * 100;
    return null;
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="products-container inicio-page">
      <div className="inicio-inner">
        <header className="inicio-header">
          <h1>Productos</h1>
          {canEdit && (
            <button className="tiendas-add-btn" onClick={openNewModal}>+</button>
          )}
        </header>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <span className="spinner-border" />
          </div>
        ) : products.length === 0 ? (
          <div className="tiendas-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
            </svg>
            <div style={{ fontWeight: 600, marginTop: 8 }}>Sin productos</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Los productos aparecerán aquí</div>
          </div>
        ) : activeFilter ? (
          /* ── Vista filtrada (marca o categoría) ── */
          <>
            <button className="pb-back" onClick={clearFilter}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
              Productos
            </button>
            {/* ── Filter hero: brand/category stats ── */}
            {(() => {
              const isBrand = !!filterMarca;
              const idx = isBrand
                ? proveedores.indexOf(filterMarca)
                : categories.indexOf(filterCategoria);
              const style = isBrand
                ? brandStyle(filterMarca, idx)
                : catStyle(filterCategoria, idx);
              const catIcon = !isBrand ? catIconUrl(filterCategoria) : null;
              const stockTotal = displayProducts.reduce((s, p) => s + (p.stock || 0), 0);
              const precioPromedio = displayProducts.length > 0
                ? displayProducts.reduce((s, p) => s + (p.precioVenta || 0), 0) / displayProducts.length
                : 0;
              const sinStock = displayProducts.filter(p => (p.stock || 0) === 0).length;
              const valorInventario = displayProducts.reduce((s, p) => s + ((p.precioCompra || 0) * (p.stock || 0)), 0);
              const fmtMoney = (v) => {
                if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
                return mxn(v);
              };
              return (
                <div className="pb-filter-hero" style={{ background: style.gradient }}>
                  <div className="pb-filter-hero-left">
                    {style.logo
                      ? <img className="pb-hero-logo" src={style.logo} alt={filterMarca} />
                      : catIcon
                        ? <img className="pb-hero-cat-icon" src={catIcon} alt="" />
                        : <span className="pb-hero-name">{filterMarca || filterCategoria}</span>
                    }
                    <span className="pb-hero-count">{displayProducts.length} producto{displayProducts.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="pb-hero-stats">
                    <div className="pb-hero-stat">
                      <span className="pb-hero-stat-value">{mxn(precioPromedio)}</span>
                      <span className="pb-hero-stat-label">PRECIO PROM.</span>
                    </div>
                    <div className="pb-hero-stat">
                      <span className="pb-hero-stat-value">{stockTotal.toLocaleString('es-MX')}</span>
                      <span className="pb-hero-stat-label">STOCK TOTAL</span>
                    </div>
                    <div className="pb-hero-stat">
                      <span className="pb-hero-stat-value">{sinStock}</span>
                      <span className="pb-hero-stat-label">SIN STOCK</span>
                    </div>
                    <div className="pb-hero-stat">
                      <span className="pb-hero-stat-value">{fmtMoney(valorInventario)}</span>
                      <span className="pb-hero-stat-label">VALOR INV.</span>
                    </div>
                  </div>
                </div>
              );
            })()}
            {renderProducts(displayProducts)}
          </>
        ) : (
          /* ── Browse: marcas + categorías + todos ── */
          <>
            {(categories.length > 0 || canEdit) && (
              <section className="inicio-section">
                <div className="inicio-section-head" style={{ cursor: 'default', alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>
                  <h2>Explora por categoría</h2>
                  <span className="count">{categories.length}</span>
                  {canEdit && (
                    <button
                      onClick={() => setCatEditor('new')}
                      title="Nueva categoría"
                      style={{ marginLeft: 'auto', height: 32, padding: '0 14px', borderRadius: 999, border: '1.5px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <i className="bi bi-plus-lg" /> Nueva
                    </button>
                  )}
                </div>
                <div className="inicio-carousel">
                  {categories.map((cat, i) => {
                    const cs = catStyle(cat, i);
                    const icon = brandCatIcon(cat);
                    return (
                      <button
                        key={cat}
                        className="pb-cat-card"
                        style={{ background: cs.gradient, position: 'relative' }}
                        onClick={() => { setFilterMarca(null); setFilterCategoria(cat); }}
                      >
                        <img className="pb-card-emblem" src={logoBlanco} alt="" />
                        {icon
                          ? <img className="pb-cat-icon" src={icon} alt="" />
                          : <span className="pb-cat-watermark">{(cat[0] || '?').toUpperCase()}</span>}
                        <span className="pb-cat-name" style={catTitleStyle(cat)}>{cat}</span>
                        <span className="pb-cat-desc">{categoriaDescripcion(cat, countCategoria(cat))}</span>
                        <span className="pb-cat-count">
                          {countCategoria(cat)} producto{countCategoria(cat) === 1 ? '' : 's'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {proveedores.length > 0 && (
              <section className="inicio-section">
                <div className="inicio-section-head" style={{ cursor: 'default', alignSelf: 'stretch' }}>
                  <h2>Nuestras marcas</h2>
                  <span className="count">{proveedores.length}</span>
                </div>
                <div className="inicio-carousel">
                  {proveedores.map((prov, i) => {
                    const bc = brandStyle(prov, i);
                    return (
                      <button
                        key={prov}
                        className="pb-brand-card"
                        style={{ background: bc.gradient }}
                        onClick={() => { setFilterCategoria(null); setFilterMarca(prov); }}
                      >
                        {bc.logo
                          ? <img className="pb-brand-logo" src={bc.logo} alt={prov} />
                          : <span className="pb-brand-name">{prov}</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="inicio-section-head" style={{ cursor: 'default' }}><h2>Todos los productos</h2></div>
            {renderProducts(displayProducts)}
          </>
        )}
      </div>{/* /inicio-inner */}

      {/* ── Product detail modal ── */}
      {viewingProduct && (() => {
        const p    = viewingProduct;
        const imgs = p.imagenUrls?.length
          ? p.imagenUrls
          : p.imagenUrl ? [p.imagenUrl] : [];
        const curImg     = imgs[carouselIdx] || null;
        const hasMulti   = imgs.length > 1;
        const ss         = stockStatus(p.stock || 0, p.stockMinimo);
        const margenPct  = p.precioCompra > 0 && p.precioVenta > 0
          ? (((p.precioVenta - p.precioCompra) / p.precioCompra) * 100).toFixed(0)
          : null;

        return (
          <div className="pd-overlay" onClick={() => setViewingProduct(null)}>
            <div className="pd-panel" onClick={e => e.stopPropagation()}>

              {/* Hero image */}
              <div className="pd-hero">
                {curImg ? (
                  <img
                    key={carouselIdx}
                    src={curImg}
                    alt={p.nombre}
                    className="pd-hero-img"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="pd-hero-fallback">
                    <img src={sinImagen} alt="" style={{ width: 100, height: 100, objectFit: 'contain', opacity: 0.4 }} />
                  </div>
                )}

                {/* Carousel */}
                {hasMulti && (
                  <>
                    <button className="pd-nav pd-nav-left" onClick={() => setCarouselIdx(i => (i - 1 + imgs.length) % imgs.length)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
                    </button>
                    <button className="pd-nav pd-nav-right" onClick={() => setCarouselIdx(i => (i + 1) % imgs.length)}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9,18 15,12 9,6"/></svg>
                    </button>
                    <div className="pd-dots">
                      {imgs.map((_, i) => (
                        <button
                          key={i}
                          className={`pd-dot${i === carouselIdx ? ' pd-dot-active' : ''}`}
                          onClick={() => setCarouselIdx(i)}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Floating buttons */}
                <button className="pd-btn-close" onClick={() => setViewingProduct(null)}>{IconClose}</button>
                {canEdit && (
                  <button className="pd-btn-edit" onClick={() => openEditModal(p)}>{IconEdit}</button>
                )}
              </div>

              {/* Info card */}
              <div className="pd-info">
                {/* Name + price header */}
                <div className="pd-info-header">
                  <div className="pd-info-name-block">
                    <div className="pd-info-nombre">{p.nombre}</div>
                    <div className="pd-info-meta">
                      {p.categoria && (
                        <span className="pd-info-cat">
                          <span className="pd-cat-dot" />
                          {p.categoria}
                        </span>
                      )}
                      {p.codigo && (
                        <>
                          {p.categoria && <span style={{ color: '#D1D5DB' }}>·</span>}
                          <span className="pd-info-codigo">
                            {IconBarcode} {p.codigo}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="pd-info-price-block">
                    <div className="pd-info-price">{mxn(p.precioVenta)}</div>
                    <div className="pd-info-price-label">PRECIO</div>
                  </div>
                </div>

                <div className="pd-divider" />

                {/* Stats */}
                <div className="pd-stats">
                  {/* Stock */}
                  <div className="pd-stat">
                    <div className="pd-stat-icon" style={{ background: 'var(--role-tinted-bg)' }}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--role-primary)" strokeWidth="2">
                        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                      </svg>
                    </div>
                    <div>
                      <div className="pd-stat-label">STOCK</div>
                      <div className="pd-stat-value">
                        {p.stock ?? 0} <span className="pd-stat-unit">uds</span>
                      </div>
                    </div>
                  </div>

                  {p.proveedor ? (
                    <>
                      <div className="pd-stat-divider" />
                      <div className="pd-stat">
                        <div className="pd-stat-icon" style={{ background: 'var(--role-tinted-bg)' }}>
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--role-primary)" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/>
                            <polyline points="9,22 9,12 15,12 15,22"/>
                          </svg>
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="pd-stat-label">PROVEEDOR</div>
                          <div className="pd-stat-value" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.proveedor}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {margenPct ? (
                    <>
                      <div className="pd-stat-divider" />
                      <div className="pd-stat">
                        <div className="pd-stat-icon" style={{ background: '#10B9811A' }}>
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#10B981" strokeWidth="2">
                            <polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/>
                            <polyline points="17,6 23,6 23,12"/>
                          </svg>
                        </div>
                        <div>
                          <div className="pd-stat-label">MARGEN</div>
                          <div className="pd-stat-value" style={{ color: '#10B981' }}>
                            {margenPct}<span className="pd-stat-unit">%</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                {/* Action buttons */}
                {canEdit && (
                  <div className="pd-actions">
                    {canDelete && (
                      <button
                        className="pd-btn-danger"
                        onClick={() => { setDeleteConfirm(p); setViewingProduct(null); }}
                      >
                        Eliminar
                      </button>
                    )}
                    <button className="pd-btn-primary" onClick={() => openEditModal(p)}>
                      Editar producto
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <div className="pf-overlay" onClick={() => setShowModal(false)}>
          <div className="pf-panel" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="pf-header">
              <div>
                <h3 className="pf-title">{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h3>
                {editingProduct && <div className="pf-subtitle">{editingProduct.nombre}</div>}
              </div>
              <button className="pf-close-btn" onClick={() => setShowModal(false)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-muted)" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="pf-body">

              {/* ── Fotos ── */}
              <ImageSlotGrid
                slots={formData.slots}
                onChange={slots => setFormData(f => ({ ...f, slots }))}
              />

              {/* ── Información básica ── */}
              <SeccionForm
                iconEl={
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                    <line x1="7" y1="7" x2="7.01" y2="7" stroke="white" strokeWidth="2"/>
                  </svg>
                }
                titulo="Información básica"
                color="var(--role-primary)"
              >
                <NuevoCampo
                  label="Nombre del producto"
                  placeholder="Ej: Leche entera 1L"
                  value={formData.nombre}
                  onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))}
                />
                <NuevoCampo
                  label="Código / SKU"
                  placeholder="7501234567890"
                  value={formData.codigo}
                  onChange={e => setFormData(f => ({ ...f, codigo: e.target.value }))}
                  mono
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <NuevoCampo
                    label="Categoría"
                    placeholder="Lácteos"
                    value={formData.categoria}
                    onChange={e => setFormData(f => ({ ...f, categoria: e.target.value }))}
                  />
                  <NuevoCampo
                    label="Proveedor"
                    placeholder="Lala"
                    value={formData.proveedor}
                    onChange={e => setFormData(f => ({ ...f, proveedor: e.target.value }))}
                  />
                </div>
              </SeccionForm>

              {/* ── Precios ── */}
              <SeccionForm
                iconEl={
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm.31 14.71c-1.52.29-2.72 1.16-2.73 2.77-.01-2.2-1.9-2.96-3.66-3.42-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39z"/>
                  </svg>
                }
                titulo="Precios"
                color="#10B981"
              >
                <div style={{ display: 'flex', gap: 10 }}>
                  <NuevoCampo
                    label="Costo de compra"
                    placeholder="0.00"
                    value={formData.precioCompra}
                    onChange={e => setFormData(f => ({ ...f, precioCompra: e.target.value }))}
                    prefix="$"
                    type="number"
                  />
                  <NuevoCampo
                    label="Precio de venta *"
                    placeholder="0.00"
                    value={formData.precioVenta}
                    onChange={e => setFormData(f => ({ ...f, precioVenta: e.target.value }))}
                    prefix="$"
                    type="number"
                  />
                </div>

                {margenPreview !== null && (
                  <div className={`pf-margen${margenPreview >= 0 ? ' pf-margen-pos' : ' pf-margen-neg'}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                        {margenPreview >= 0
                          ? <><polyline points="23,6 13.5,15.5 8.5,10.5 1,18"/><polyline points="17,6 23,6 23,12"/></>
                          : <><polyline points="23,18 13.5,8.5 8.5,13.5 1,6"/><polyline points="17,18 23,18 23,12"/></>
                        }
                      </svg>
                      Margen
                    </div>
                    <strong>{margenPreview >= 0 ? '+' : ''}{margenPreview.toFixed(1)}%</strong>
                  </div>
                )}
              </SeccionForm>

              {/* ── Inventario ── */}
              <SeccionForm
                iconEl={
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                }
                titulo="Inventario"
                color="#F59E0B"
              >
                <div style={{ display: 'flex', gap: 10 }}>
                  <NuevoCampo
                    label="Stock actual"
                    placeholder="0"
                    value={formData.stock}
                    onChange={e => setFormData(f => ({ ...f, stock: e.target.value }))}
                    suffix="uds"
                    type="number"
                  />
                  <NuevoCampo
                    label="Stock mínimo"
                    placeholder="5"
                    value={formData.stockMinimo}
                    onChange={e => setFormData(f => ({ ...f, stockMinimo: e.target.value }))}
                    suffix="uds"
                    type="number"
                  />
                </div>
              </SeccionForm>

            </div>{/* /pf-body */}

            {/* Footer */}
            <div className="pf-footer">
              <button className="pf-btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="pf-btn-save" onClick={handleSave}>
                {editingProduct ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>

          </div>
        </div>
      )}

      {deleteConfirm && (
        <ConfirmModal
          titulo="Eliminar Producto"
          mensaje={`¿Estás seguro de eliminar "${deleteConfirm.nombre}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
          tipo="danger"
        />
      )}

      {catEditor && (
        <CategoriaEditorModal
          empresa={empresaActiva}
          empresaId={activaId}
          categoria={catEditor === 'new' ? null : catEditor}
          onClose={() => setCatEditor(null)}
          onSaved={() => {
            setCatEditor(null);
            const ctrl = new AbortController();
            fetchProducts(ctrl.signal);
          }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: 'white', padding: '10px 20px',
          borderRadius: 10, fontSize: 14, fontWeight: 500,
          zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap'
        }}>
          {toast}
        </div>
      )}

    </div>
  );
};

export default Products;
