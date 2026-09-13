import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEmpresa } from '../context/EmpresaContext';
import { filterByActiveEmpresa } from '../lib/empresaActiva';
import empleadoService from '../services/empleadoService';
import tiendaService from '../services/tiendaService';
import registroActividadService from '../services/registroActividadService';
import '../styles/empleados.css';
import empLogoDark  from '../assets/logo-dark.png';
import empLogoLight from '../assets/logo-light.png';

// Mismo esquema que Tiendas.jsx: logo claro u oscuro según el fondo del gradiente
const EMP_FORMATO_LOGO = {
  'Punto Verde':    empLogoDark,
  'Punto Verde GO': empLogoLight,
  'Punto Verde XL': empLogoDark,
  'PuntoVerde':     empLogoDark,
  'PuntoVerde GO':  empLogoLight,
  'PuntoVerde XL':  empLogoDark,
};
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase.js';

const COLORS = {
  primary: 'var(--role-primary)',
  primaryDark: '#0F4D2E',
  success: '#4ADE80',
  warning: '#F0A500',
  danger: '#E63946',
  purple: '#8B5CF6',
  blue: '#2563EB',
  textDark: 'var(--text-dark)',
  textMuted: 'var(--text-muted)',
  border: '#E4E6EA',
  background: '#F4F5F7',
  surface: '#FFFFFF',
};

const ROL_COLORS = {
  STAFF: 'var(--role-primary)',
  MANAGER: '#2563EB',
  ADMIN: '#64748B',
};

const FORMATO_COLORS = {
  'Punto Verde':    ['var(--role-primary)', '#0F4D2E'],
  'PuntoVerde':     ['var(--role-primary)', '#0F4D2E'],
  'Punto Verde GO': ['#F0A500', '#C67F00'],
  'PuntoVerde GO':  ['#F0A500', '#C67F00'],
  'Punto Verde XL': ['#1A1A1A', '#000000'],
  'PuntoVerde XL':  ['#1A1A1A', '#000000'],
  'Punto Verde XL': ['#1C1E21', '#0F0F10'],
};

const formatDateShort = (date) => {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatNumEmpleado = (num) => num?.startsWith('EMP') ? num : `EMP-${num}`;

const getRolShortName = (rol) => ({ STAFF: 'Staff', MANAGER: 'Manager', LIDER: 'Líder', ADMIN: 'Admin', DIRECTOR: 'Director' }[rol] || rol);

const calcularVacacionesLFT = (fechaIngreso) => {
  if (!fechaIngreso) return { años: 0, dias: 0 };
  const años = Math.floor((new Date() - new Date(fechaIngreso)) / (365.25 * 24 * 60 * 60 * 1000));
  let dias = 0;
  if (años >= 1 && años <= 4) dias = 12 + (años - 1) * 2;
  else if (años >= 5 && años <= 9) dias = 20;
  else if (años >= 10) dias = 20 + Math.floor((años - 5) / 5) * 2;
  return { años, dias };
};

const getInicioSemanaActual = () => {
  const hoy = new Date();
  const dia = hoy.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diff);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
};

const getInicioSemanaPasada = () => {
  const inicioActual = getInicioSemanaActual();
  const inicio = new Date(inicioActual);
  inicio.setDate(inicio.getDate() - 7);
  return inicio;
};

const ROL_GROUPS = [
  { key: 'staff', label: 'Staff', roles: ['STAFF'] },
  { key: 'managers', label: 'Managers', roles: ['MANAGER', 'LIDER'] },
  { key: 'directivos', label: 'Directivos', roles: ['ADMIN', 'DIRECTOR'] },
];

const StaffHeroCard = ({ emp, tienda, yo = false, onOpen, onContext }) => {
  const gradient = getHeaderGradient(emp, tienda);
  return (
    <div
      className="hero-card hero-card--emp"
      style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`, cursor: 'pointer' }}
      onClick={() => onOpen(emp)}
      onContextMenu={(e) => onContext && onContext(e, emp)}
    >
      <img className="hero-card-emblem" src={EMP_FORMATO_LOGO[tienda?.formato] || empLogoLight} alt="" />
      <div className="emp-card-top">
        <div className="emp-card-avatar">
          <EmpleadoAvatar empleado={emp} size={64} />
        </div>
        {yo && <span className="emp-card-yo">Yo</span>}
        {!yo && emp.activo === false && <span className="emp-card-inactivo">Inactivo</span>}
      </div>
      <div className="hero-card-title emp-card-title">{emp.nombre}</div>
      <div className="emp-card-sub">{tienda?.nombre || emp.tiendaNombre || 'Sin sucursal asignada'}</div>
      <div className="emp-card-footer">
        <span className="emp-card-role">{getRolShortName(emp.rol)}</span>
        <span className="emp-card-num">{formatNumEmpleado(emp.numEmpleado)}</span>
      </div>
    </div>
  );
};

const EmpleadoAvatar = ({ empleado, size = 32 }) => {
  const initials = empleado.nombre
    ? empleado.nombre.split(' ').slice(0, 2).map(n => n?.[0]?.toUpperCase() || '').join('')
    : '?';

  const rolColor = ROL_COLORS[empleado.rol] || ROL_COLORS.STAFF;

  if (empleado.fotoUrl) {
    return (
      <img
        src={empleado.fotoUrl}
        alt={empleado.nombre}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${rolColor}, ${rolColor}CC)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: size * 0.38,
        fontWeight: 'bold',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
};

const getHeaderGradient = (empleado, tienda) => {
  // Si hay tienda con formato, el color lo define la sucursal (todos los roles)
  if (tienda?.formato) {
    const fmt = tienda.formato.trim();
    const key = Object.keys(FORMATO_COLORS).find(k => k.toLowerCase() === fmt.toLowerCase());
    if (key) return FORMATO_COLORS[key];
  }
  const map = {
    STAFF: ['var(--role-primary)', '#0F4D2E'],
    MANAGER: ['#2563EB', '#1E3A5F'],
    ADMIN: ['#64748B', '#1E293B'],
  };
  return map[empleado.rol?.toUpperCase()] || map.STAFF;
};

const EmptyState = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
    <i className="bi bi-person-circle" style={{ fontSize: 64, marginBottom: 16 }}></i>
    <p>Selecciona un empleado</p>
  </div>
);

const EmpleadoDetalle = ({ empleado, tiendas = [], onEdit, onNuevaTarea, onBack }) => {
  const [metricas, setMetricas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tienda, setTienda] = useState(null);

  // Resolver tienda: primero busca en el array, si no la encuentra la busca directo
  useEffect(() => {
    if (!empleado) { setTienda(null); return; }
    const tid = empleado.tiendaAsignada || empleado.tiendaId || empleado.tiendasAsignadas?.[0];
    console.log('[EmpDetalle] empleado:', empleado.nombre, '| tid:', tid, '| tiendaAsignada:', empleado.tiendaAsignada, '| tiendaId:', empleado.tiendaId);
    console.log('[EmpDetalle] tiendas cargadas:', tiendas.map(t => ({ id: t.id, nombre: t.nombre, formato: t.formato })));
    if (!tid) { setTienda(null); return; }
    const found = tiendas.find(t => t.id === tid);
    console.log('[EmpDetalle] found:', found);
    if (found) { setTienda(found); return; }
    // Fallback: fetch directo por ID
    tiendaService.getById(tid).then(r => {
      console.log('[EmpDetalle] getById result:', r);
      setTienda(r.success ? r.data : null);
    });
  }, [empleado?.uid, empleado?.tiendaAsignada, empleado?.tiendaId, tiendas]);

  useEffect(() => {
    if (!empleado) return;
    setLoading(true);
    
    const fetchMetricas = async () => {
      try {
        const uid = empleado.uid;

        const ordenesRef = collection(db, 'ordenes');
        const ordenesQ = query(ordenesRef, where('idEmpleado', '==', uid));
        const ordenesSnap = await getDocs(ordenesQ);
        const ordenes = [];
        ordenesSnap.forEach(doc => ordenes.push({ id: doc.id, ...doc.data() }));

        const now = new Date();
        const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

        const ordenesDelMes = ordenes.filter(o => {
          const fecha = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
          return fecha >= inicioMes;
        });
        const ventasMesCount = ordenesDelMes.length;
        const ventasMesMonto = ordenesDelMes.reduce((sum, o) => sum + (o.total || 0), 0);

        const creditosRef = collection(db, 'creditos');
        const creditosQ = query(creditosRef, where('aprobadoPorUid', '==', uid));
        const creditosSnap = await getDocs(creditosQ);
        let creditosAprobados = 0;
        let creditosMonto = 0;
        creditosSnap.forEach(doc => {
          const data = doc.data();
          creditosAprobados++;
          creditosMonto += data.montoAprobado || 0;
        });

        const faltasRef = collection(db, 'faltas');
        const faltasQ = query(faltasRef, where('empleadoUid', '==', uid));
        const faltasSnap = await getDocs(faltasQ);
        const faltas = [];
        faltasSnap.forEach(doc => faltas.push({ id: doc.id, ...doc.data() }));

        const inicioSemanaActual = getInicioSemanaActual();
        const weekStart = inicioSemanaActual;
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        // Query turnos for the whole month (for monthly calendar) — then extract week client-side
        const mesStartStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const mesEndStr = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];
        const turnosRef2 = collection(db, 'turnos');
        const turnosQ = query(turnosRef2, where('fecha', '>=', mesStartStr), where('fecha', '<', mesEndStr));
        const turnosSnap = await getDocs(turnosQ);
        const turnosMes = [];
        turnosSnap.forEach(d => { const t = { id: d.id, ...d.data() }; if (t.empleadoId === uid) turnosMes.push(t); });
        const turnosSemana = turnosMes.filter(t => t.fecha >= weekStartStr && t.fecha < weekEndStr);
        const faltasSemana = faltas.filter(f => {
          const fd = f.fecha?.toDate ? f.fecha.toDate() : new Date(f.fecha || 0);
          return fd >= weekStart && fd < weekEnd;
        });
        const inicioSemanaPasada = getInicioSemanaPasada();
        const finSemanaPasada = new Date(inicioSemanaActual);
        finSemanaPasada.setDate(finSemanaPasada.getDate() - 1);

        let montoActual = 0;
        let montoPasado = 0;

        ordenes.forEach(o => {
          const fecha = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
          if (fecha >= inicioSemanaActual) {
            montoActual += o.total || 0;
          } else if (fecha >= inicioSemanaPasada && fecha <= finSemanaPasada) {
            montoPasado += o.total || 0;
          }
        });

        const dia = now.getDay();
        const diasHabilesTranscurridos = dia === 0 ? 0 : dia;
        const puntualidad = diasHabilesTranscurridos > 0
          ? Math.max(0, ((diasHabilesTranscurridos - faltas.filter(f => f.tipo === 'injustificada').length) / diasHabilesTranscurridos) * 100)
          : 100;

        const mesActual = new Date(now.getFullYear(), now.getMonth(), 1);
        const faltasMesArr = faltas.filter(f => {
          const fecha = f.fecha?.toDate ? f.fecha.toDate() : new Date(f.fecha);
          return fecha >= mesActual;
        });
        const faltasMes = faltasMesArr.length;

        const asistencia = diasHabilesTranscurridos > 0
          ? Math.max(0, ((diasHabilesTranscurridos - faltasMes) / diasHabilesTranscurridos) * 100)
          : 100;

        const vacacionInfo = calcularVacacionesLFT(empleado.fechaIngreso);

        setMetricas({
          ordenes: ordenes.length,
          ventasMesCount,
          ventasMesMonto,
          creditosAprobados,
          creditosMonto,
          montoActual,
          montoPasado,
          puntualidad,
          asistencia,
          faltasMes,
          vacacionInfo,
          turnosSemana,
          faltasSemana,
          turnosMes,
          faltasMesArr,
        });
      } catch (error) {
        console.error('Error fetching metricas:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchMetricas();
  }, [empleado]);

  if (!empleado) return (
    <div className="empleados-detalle empleados-detalle-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <EmptyState />
    </div>
  );

  const gradient = getHeaderGradient(empleado, tienda);
  const themePrimary = ROL_COLORS[empleado.rol] || COLORS.primary;

  const m = metricas || {
    ordenes: 0, ventasMesCount: 0, ventasMesMonto: 0,
    creditosAprobados: 0, creditosMonto: 0,
    montoActual: 0, montoPasado: 0,
    puntualidad: 100, asistencia: 100, faltasMes: 0,
    vacacionInfo: { años: 0, dias: 0 },
    turnosSemana: [], faltasSemana: [],
    turnosMes: [], faltasMesArr: [],
  };

  const ticketPromedio = m.ventasMesCount > 0
    ? Math.round(m.ventasMesMonto / m.ventasMesCount)
    : m.ordenes > 0 ? Math.round(m.ventasMesMonto / m.ordenes) : 0;

  const deltaVentas = m.montoPasado > 0
    ? ((m.montoActual - m.montoPasado) / m.montoPasado) * 100
    : m.montoActual > 0 ? 100 : 0;

  return (
    <div className="empleados-detalle">
      {/* Header con gradiente de rol */}
      <div style={{
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        padding: '20px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        gap: 8,
      }}>
        {/* Botón volver — solo mobile */}
        <button
          className="empleados-detalle-back"
          onClick={onBack}
          style={{
            position: 'absolute', top: 14, left: 14,
            background: 'rgba(255,255,255,0.18)', border: 'none',
            borderRadius: '50%', width: 36, height: 36,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <i className="bi bi-chevron-left" style={{ color: 'white', fontSize: 16 }}></i>
        </button>

        <button onClick={() => onEdit(empleado)} style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(255,255,255,0.18)', border: 'none',
          borderRadius: '50%', width: 36, height: 36,
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <i className="bi bi-gear-fill" style={{ color: 'white', fontSize: 15 }}></i>
        </button>

        {/* Logo + nombre de sucursal */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <img
            src={EMP_FORMATO_LOGO[tienda?.formato] || empLogoDark}
            alt="PuntoVerde"
            style={{ height: 28, objectFit: 'contain' }}
          />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'white', letterSpacing: 0.1, textAlign: 'center' }}>
            {tienda?.nombre || empleado.tiendaNombre || 'Sin sucursal asignada'}
          </span>
        </div>

        <EmpleadoAvatar empleado={empleado} size={72} />

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'white', margin: 0 }}>
            {empleado.nombre}
          </h2>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
            {formatNumEmpleado(empleado.numEmpleado)}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
            Ingreso: {formatDateShort(empleado.fechaIngreso)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{
            padding: '3px 12px', fontSize: 11, fontWeight: 700,
            background: 'rgba(255,255,255,0.2)', borderRadius: 20, color: 'white',
          }}>
            {getRolShortName(empleado.rol)}
          </span>
          {empleado.activo === false && (
            <span style={{
              padding: '3px 12px', fontSize: 11, fontWeight: 700,
              background: 'rgba(220,38,38,0.5)', borderRadius: 20, color: 'white',
            }}>
              Inactivo
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 28,
          padding: '20px 0',
          background: 'white',
          borderBottom: '1px solid #E4E6EA',
        }}
      >
        {empleado.telefono && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'white',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="bi bi-telephone-fill" style={{ color: themePrimary, fontSize: 20 }}></i>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Llamar</span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'white',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="bi bi-envelope-fill" style={{ color: themePrimary, fontSize: 20 }}></i>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Email</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'white',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="bi bi-file-text-fill" style={{ color: themePrimary, fontSize: 20 }}></i>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Documentos</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => onNuevaTarea(empleado)}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'white',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="bi bi-check2-square" style={{ color: themePrimary, fontSize: 20 }}></i>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tarea</span>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
          <div
            style={{
              background: 'white',
              borderRadius: 14,
              padding: 12,
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-dark)', marginBottom: 10 }}>Desempeño en ventas</div>
            <div className="emp-stats-grid">
              <div style={{ backgroundColor: '#F4F5F7', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: themePrimary + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="bi bi-cart-fill" style={{ color: themePrimary, fontSize: 14 }}></i>
                </div>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--text-dark)' }}>{loading ? '…' : m.ordenes}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total ventas</div>
              </div>
              <div style={{ backgroundColor: '#F4F5F7', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#3B82F620', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="bi bi-calendar2-event" style={{ color: '#3B82F6', fontSize: 14 }}></i>
                </div>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--text-dark)' }}>{m.ventasMesCount}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ventas mes</div>
              </div>
              <div style={{ backgroundColor: '#F4F5F7', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#8B5CF620', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="bi bi-credit-card" style={{ color: '#8B5CF6', fontSize: 14 }}></i>
                </div>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--text-dark)' }}>{m.creditosAprobados}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Créditos · ${m.creditosMonto.toLocaleString()}</div>
              </div>
              <div style={{ backgroundColor: '#F4F5F7', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#F0A50020', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="bi bi-tag-fill" style={{ color: '#F0A500', fontSize: 14 }}></i>
                </div>
                <div style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--text-dark)' }}>${ticketPromedio.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Ticket prom.</div>
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'white',
              borderRadius: 14,
              padding: 12,
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-dark)' }}>Ventas esta semana</span>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 'bold',
                  backgroundColor: deltaVentas >= 0 ? '#4ADE8020' : '#E6394620',
                  color: deltaVentas >= 0 ? '#4ADE80' : '#E63946',
                }}
              >
                {deltaVentas >= 0 ? <i className="bi bi-arrow-up-right" style={{ marginRight: 4 }}></i> : <i className="bi bi-arrow-down-right" style={{ marginRight: 4 }}></i>}
                {Math.abs(deltaVentas).toFixed(0)}%
              </span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sem. pasada</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>${m.montoPasado.toLocaleString()}</span>
              </div>
              <div style={{ height: 14, borderRadius: 4, backgroundColor: 'rgba(107,124,147,0.12)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (m.montoPasado / Math.max(m.montoActual, m.montoPasado, 1)) * 100)}%`,
                    backgroundColor: 'rgba(107,124,147,0.4)',
                  }}
                ></div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Esta semana</span>
                <span style={{ fontSize: 11, fontWeight: 'bold', color: themePrimary }}>${m.montoActual.toLocaleString()}</span>
              </div>
              <div style={{ height: 14, borderRadius: 4, backgroundColor: themePrimary + '20', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (m.montoActual / Math.max(m.montoActual, m.montoPasado, 1)) * 100)}%`,
                    backgroundColor: themePrimary,
                  }}
                ></div>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
              {m.montoPasado > m.montoActual ? (
                <>
                  <i className="bi bi-arrow-right" style={{ color: '#F0A500' }}></i>
                  <span style={{ color: 'var(--text-muted)' }}>Faltan ${(m.montoPasado - m.montoActual).toLocaleString()} para igualar la semana pasada</span>
                </>
              ) : m.montoActual > 0 ? (
                <>
                  <i className="bi bi-check-circle-fill" style={{ color: '#4ADE80' }}></i>
                  <span style={{ color: 'var(--text-muted)' }}>Superaste la semana pasada</span>
                </>
              ) : null}
            </div>
          </div>

          {/* ── Weekly attendance visualization ── */}
          <div style={{ background: 'white', borderRadius: 14, padding: '12px 14px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-dark)', marginBottom: 10 }}>Asistencia esta semana</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {['L','M','X','J','V','S','D'].map((dayLabel, idx) => {
                const dayDate = new Date(getInicioSemanaActual());
                dayDate.setDate(dayDate.getDate() + idx);
                const dateStr = dayDate.toISOString().split('T')[0];
                const hoyStr = new Date().toISOString().split('T')[0];
                const isFuture = dateStr > hoyStr;
                const isToday = dateStr === hoyStr;
                const turno = (m.turnosSemana || []).find(t => t.fecha === dateStr);
                const falta = (m.faltasSemana || []).find(f => {
                  const fd = f.fecha?.toDate ? f.fecha.toDate() : new Date(f.fecha || 0);
                  return fd.toISOString().split('T')[0] === dateStr;
                });
                let bg, symbol;
                if (isFuture)                              { bg = '#E5E7EB'; symbol = null; }
                else if (turno?.tipo === 'descanso')       { bg = '#94A3B8'; symbol = '—'; }
                else if (falta?.tipo === 'injustificada')  { bg = '#EF4444'; symbol = '✕'; }
                else if (falta)                            { bg = '#F97316'; symbol = '!'; }
                else if (turno)                            { bg = '#22C55E'; symbol = '✓'; }
                else                                       { bg = '#D1D5DB'; symbol = null; }
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: isToday ? `2px solid ${themePrimary}` : '2px solid transparent',
                      boxSizing: 'border-box',
                    }}>
                      {symbol && <span style={{ color: 'white', fontSize: 12, fontWeight: 800, lineHeight: 1 }}>{symbol}</span>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: isToday ? 800 : 500, color: isToday ? themePrimary : '#9CA3AF' }}>{dayLabel}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {[['#22C55E','Presente'],['#F97316','Justificada'],['#EF4444','Injustificada'],['#94A3B8','Descanso']].map(([c, l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
                  <span style={{ fontSize: 10, color: '#9CA3AF' }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Monthly attendance calendar ── */}
          {(() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const todayNum = now.getDate();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            // JS getDay() returns 0=Sun…6=Sat; we want 0=Mon…6=Sun
            const firstDow = new Date(year, month, 1).getDay();
            const firstColOffset = firstDow === 0 ? 6 : firstDow - 1;
            const hoyStr = now.toISOString().split('T')[0];
            // Build lookup maps
            const turnoByDate = {};
            (m.turnosMes || []).forEach(t => { turnoByDate[t.fecha] = t; });
            const faltaByDate = {};
            (m.faltasMesArr || []).forEach(f => {
              const fd = f.fecha?.toDate ? f.fecha.toDate() : new Date(f.fecha || 0);
              const ds = fd.toISOString().split('T')[0];
              faltaByDate[ds] = f;
            });
            const dayNums = Array.from({ length: daysInMonth }, (_, i) => i + 1);
            const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            return (
              <div style={{ background: 'white', borderRadius: 14, padding: '12px 14px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-dark)', marginBottom: 10 }}>
                  Asistencia — {MONTH_LABELS[month]}
                </div>
                {/* Day-of-week header */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                  {['L','M','X','J','V','S','D'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#CBD5E1', textTransform: 'uppercase' }}>{d}</div>
                  ))}
                </div>
                {/* Day grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {/* Empty offset cells */}
                  {Array.from({ length: firstColOffset }).map((_, i) => (
                    <div key={`e${i}`} />
                  ))}
                  {dayNums.map(day => {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const isFuture = day > todayNum;
                    const isToday = day === todayNum;
                    const dowJs = new Date(year, month, day).getDay();
                    const isWeekend = dowJs === 0 || dowJs === 6;
                    const turno = turnoByDate[dateStr];
                    const falta = faltaByDate[dateStr];
                    let bg, txt;
                    if (isFuture)                              { bg = '#F1F5F9'; txt = null; }
                    else if (turno?.tipo === 'descanso')       { bg = '#94A3B8'; txt = '—'; }
                    else if (falta?.tipo === 'injustificada')  { bg = '#EF4444'; txt = '✕'; }
                    else if (falta)                            { bg = '#F97316'; txt = '!'; }
                    else if (turno)                            { bg = '#22C55E'; txt = '✓'; }
                    else if (isWeekend)                        { bg = '#CBD5E1'; txt = null; }
                    else                                       { bg = '#E2E8F0'; txt = null; }
                    return (
                      <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%',
                          background: bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: isToday ? `2px solid ${themePrimary}` : '2px solid transparent',
                          boxSizing: 'border-box',
                          fontSize: txt ? 9 : 8, fontWeight: 800, color: 'white',
                        }}>
                          {txt || <span style={{ color: isFuture ? '#CBD5E1' : '#94A3B8', fontSize: 9, fontWeight: 600 }}>{day}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="emp-mini-stats">
            <div style={{ background: 'white', borderRadius: 12, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
              <i className="bi bi-hourglass-split" style={{ fontSize: 15, color: m.puntualidad >= 90 ? '#4ADE80' : m.puntualidad >= 75 ? '#F0A500' : '#E63946' }}></i>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--text-dark)' }}>{m.puntualidad.toFixed(0)}%</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>Puntualidad</div>
            </div>
            <div style={{ background: 'white', borderRadius: 12, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
              <i className="bi bi-person-check-fill" style={{ fontSize: 15, color: m.asistencia >= 90 ? '#4ADE80' : m.asistencia >= 75 ? '#F0A500' : '#E63946' }}></i>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--text-dark)' }}>{m.asistencia.toFixed(0)}%</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>Asistencia</div>
            </div>
            <div style={{ background: 'white', borderRadius: 12, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
              <i className="bi bi-calendar-x" style={{ fontSize: 15, color: m.faltasMes === 0 ? '#4ADE80' : m.faltasMes <= 2 ? '#F0A500' : '#E63946' }}></i>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--text-dark)' }}>{m.faltasMes}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>Faltas mes</div>
            </div>
            <div style={{ background: 'white', borderRadius: 12, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
              <i className="bi bi-umbrella-fill" style={{ fontSize: 15, color: themePrimary }}></i>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--text-dark)' }}>{m.vacacionInfo.dias > 0 ? `${m.vacacionInfo.dias}d` : '—'}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>Vacaciones</div>
            </div>
          </div>

          {/* ── iOS Contacts-style info cards ── */}
          {[
            {
              title: 'Contacto', icon: 'bi-telephone-fill',
              rows: [
                empleado.telefono && { icon: 'bi-telephone', label: 'Teléfono', value: empleado.telefono },
                empleado.email && { icon: 'bi-envelope', label: 'Email', value: empleado.email },
              ].filter(Boolean),
            },
            {
              title: 'Trabajo', icon: 'bi-briefcase-fill',
              rows: [
                tienda?.nombre && { icon: 'bi-shop', label: 'Sucursal', value: tienda.nombre },
                empleado.rol && { icon: 'bi-person-badge', label: 'Rol', value: getRolShortName(empleado.rol) },
                empleado.tipoContrato && { icon: 'bi-file-earmark-text', label: 'Contrato', value: empleado.tipoContrato },
                empleado.numEmpleado && { icon: 'bi-hash', label: 'N° empleado', value: formatNumEmpleado(empleado.numEmpleado) },
                empleado.fechaIngreso && { icon: 'bi-calendar-event', label: 'Ingreso', value: formatDateShort(empleado.fechaIngreso) },
              ].filter(Boolean),
            },
            {
              title: 'Personal', icon: 'bi-person-lines-fill',
              rows: [
                empleado.fechaNacimiento && { icon: 'bi-cake2', label: 'Nacimiento', value: formatDateShort(empleado.fechaNacimiento) },
                empleado.sexo && { icon: 'bi-gender-ambiguous', label: 'Sexo', value: empleado.sexo },
                empleado.estadoCivil && { icon: 'bi-people', label: 'Est. civil', value: empleado.estadoCivil },
                empleado.tipoSangre && { icon: 'bi-droplet-half', label: 'Tipo sangre', value: empleado.tipoSangre },
                empleado.nivelEstudios && { icon: 'bi-mortarboard', label: 'Estudios', value: empleado.nivelEstudios },
                empleado.nacionalidad && { icon: 'bi-globe-americas', label: 'Nacion.', value: empleado.nacionalidad },
              ].filter(Boolean),
            },
            {
              title: 'Documentos', icon: 'bi-file-earmark-person-fill',
              rows: [
                empleado.curp && { icon: 'bi-card-text', label: 'CURP', value: empleado.curp },
                empleado.rfc && { icon: 'bi-file-earmark-ruled', label: 'RFC', value: empleado.rfc },
                empleado.nss && { icon: 'bi-shield-check', label: 'NSS', value: empleado.nss },
              ].filter(Boolean),
            },
            {
              title: 'Nómina', icon: 'bi-cash-stack',
              rows: [
                empleado.salarioDiario && { icon: 'bi-currency-dollar', label: 'Salario diario', value: `$${Number(empleado.salarioDiario).toLocaleString('es-MX')}` },
                empleado.banco && { icon: 'bi-bank', label: 'Banco', value: empleado.banco },
                empleado.clabe && { icon: 'bi-upc-scan', label: 'CLABE', value: empleado.clabe },
              ].filter(Boolean),
            },
            {
              title: 'Contacto de emergencia', icon: 'bi-heart-pulse-fill',
              rows: [
                empleado.contactoEmergenciaNombre && { icon: 'bi-person', label: 'Nombre', value: empleado.contactoEmergenciaNombre },
                empleado.contactoEmergenciaTelefono && { icon: 'bi-telephone', label: 'Teléfono', value: empleado.contactoEmergenciaTelefono },
                empleado.contactoEmergenciaParentesco && { icon: 'bi-people', label: 'Parentesco', value: empleado.contactoEmergenciaParentesco },
              ].filter(Boolean),
            },
          ].filter(sec => sec.rows.length > 0).map(sec => (
            <div key={sec.title} style={{ background:'white', borderRadius:14, overflow:'hidden', boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderBottom:'1px solid #F1F3F5', background:'#FAFBFC' }}>
                <i className={`bi ${sec.icon}`} style={{ fontSize:12, color:themePrimary }} />
                <span style={{ fontSize:11, fontWeight:800, color:themePrimary, textTransform:'uppercase', letterSpacing:0.8 }}>{sec.title}</span>
              </div>
              {sec.rows.map((row, ri) => (
                <div key={ri} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px', borderBottom: ri < sec.rows.length - 1 ? '1px solid #F1F3F5' : 'none' }}>
                  <i className={`bi ${row.icon}`} style={{ fontSize:14, color:'#9CA3AF', width:18, textAlign:'center', flexShrink:0 }} />
                  <div style={{ fontSize:12, color:'#9CA3AF', width:90, flexShrink:0 }}>{row.label}</div>
                  <div style={{ fontSize:13, fontWeight:500, color:'var(--text-dark)', flex:1 }}>{row.value}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
    </div>
  );
};

const Empleados = () => {
  const { empleado: currentUser } = useAuth();
  const { activaId } = useEmpresa();
  const [empleados, setEmpleados] = useState([]);
  const [tiendas, setTiendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const showToast = (msg, ms = 3000) => { setToast(msg); setTimeout(() => setToast(''), ms); };
  const [selectedEmpleado, setSelectedEmpleado] = useState(null);
  const [selectedTienda, setSelectedTienda] = useState(null);
  const [showNuevoEmpleado, setShowNuevoEmpleado] = useState(false);
  const [showNuevaTarea, setShowNuevaTarea] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);

  const isManager = currentUser?.rol === 'manager' || currentUser?.rol === 'admin' || currentUser?.rol === 'MANAGER' || currentUser?.rol === 'ADMIN';
  const canEdit = isManager;

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    const handler = () => {
      setFormData(FORM_EMPTY);
      setShowNuevoEmpleado(true);
    };
    window.addEventListener('open-nuevo-empleado', handler);
    return () => window.removeEventListener('open-nuevo-empleado', handler);
  }, [canEdit]);

  const fetchData = async () => {
    setLoading(true);
    const [empResult, tiendaResult] = await Promise.all([
      empleadoService.fetchAll(),
      tiendaService.fetchTodas(),
    ]);
    if (empResult.success) {
      // Filtro multi-tenant por empresa activa (legacy sin empresaId → default).
      let lista = filterByActiveEmpresa(empResult.data, activaId);

      // Managers solo ven staff de sus tiendas asignadas o que ellos crearon
      if (currentUser?.rol === 'manager') {
        const misAsignadas = currentUser.tiendasAsignadas || [];
        lista = lista.filter(emp => {
          const rolEmp = emp.rol?.toUpperCase();
          if (['MANAGER', 'DIRECTOR', 'ADMIN', 'LIDER'].includes(rolEmp)) return false;
          const empTid = emp.tiendaAsignada || emp.tiendaId;
          return misAsignadas.includes(empTid) || emp.creadoPorUid === currentUser.uid;
        });
      }

      setEmpleados(lista);
    }
    if (tiendaResult.success) setTiendas(filterByActiveEmpresa(tiendaResult.data, activaId));
    setLoading(false);
  };

  const getTiendaById = (id) => tiendas.find(t => t.id === id);

  const handleSelect = (emp) => {
    setSelectedEmpleado(emp);
    const tid = emp?.tiendaAsignada || emp?.tiendaId;
    setSelectedTienda(tid ? getTiendaById(tid) : null);
  };

  const handleContextMenu = (e, emp) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      empleado: emp,
    });
  };

  const handleToggleActivo = async (emp) => {
    await empleadoService.toggleActivo(emp.uid);
    fetchData();
    if (selectedEmpleado?.uid === emp.uid) {
      const updated = { ...emp, activo: !emp.activo };
      setSelectedEmpleado(updated);
    }
    setContextMenu(null);
  };

  const handleEdit = (emp) => {
    setEditingEmpleado(emp);
    const parts = emp?.nombre ? emp.nombre.split(' ') : [];
    const nombrePrimero = emp?.nombrePrimero || (parts.length >= 3 ? parts.slice(0, parts.length - 2).join(' ') : parts[0] || '');
    const apellidoPaterno = emp?.apellidoPaterno || (parts.length >= 2 ? parts[parts.length - 2] : parts[1] || '') || '';
    const apellidoMaterno = emp?.apellidoMaterno || (parts.length >= 3 ? parts[parts.length - 1] : '') || '';
    setFormData({
      nombrePrimero,
      apellidoPaterno,
      apellidoMaterno,
      numEmpleado: emp?.numEmpleado || '',
      telefono: emp?.telefono || '',
      rol: emp?.rol || 'STAFF',
      tiendaAsignada: emp?.tiendaAsignada || emp?.tiendaId || '',
      fechaNacimiento: emp?.fechaNacimiento || '',
      sexo: emp?.sexo || '',
      estadoCivil: emp?.estadoCivil || '',
      tipoSangre: emp?.tipoSangre || '',
      nacionalidad: emp?.nacionalidad || 'Mexicana',
      lugarNacimiento: emp?.lugarNacimiento || '',
      nivelEstudios: emp?.nivelEstudios || '',
      curp: emp?.curp || '',
      rfc: emp?.rfc || '',
      nss: emp?.nss || '',
      tipoContrato: emp?.tipoContrato || '',
      salarioDiario: emp?.salarioDiario != null ? String(emp.salarioDiario) : '',
      banco: emp?.banco || '',
      clabe: emp?.clabe || '',
      contactoEmergenciaNombre: emp?.contactoEmergenciaNombre || '',
      contactoEmergenciaTelefono: emp?.contactoEmergenciaTelefono || '',
      contactoEmergenciaParentesco: emp?.contactoEmergenciaParentesco || '',
    });
    setShowNuevoEmpleado(true);
    setContextMenu(null);
  };

  const FORM_EMPTY = {
    // Identificación
    nombrePrimero: '', apellidoPaterno: '', apellidoMaterno: '',
    numEmpleado: '', telefono: '',
    // Acceso
    rol: 'STAFF', tiendaAsignada: '',
    // Datos personales
    fechaNacimiento: '', sexo: '', estadoCivil: '', tipoSangre: '',
    nacionalidad: 'Mexicana', lugarNacimiento: '', nivelEstudios: '',
    // Documentos
    curp: '', rfc: '', nss: '',
    // Laboral
    tipoContrato: '', salarioDiario: '',
    // Banco
    banco: '', clabe: '',
    // Emergencia
    contactoEmergenciaNombre: '', contactoEmergenciaTelefono: '', contactoEmergenciaParentesco: '',
  };
  const [formData, setFormData] = useState(FORM_EMPTY);
  const [editingEmpleado, setEditingEmpleado] = useState(null);
  const fd = (key, val) => setFormData(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!formData.nombrePrimero || !formData.apellidoPaterno || !formData.numEmpleado) {
      showToast('Nombre(s), apellido paterno y número de empleado son requeridos');
      return;
    }

    const nombre = [formData.nombrePrimero, formData.apellidoPaterno, formData.apellidoMaterno]
      .filter(Boolean).join(' ');
    const tiendaSeleccionada = tiendas.find(t => t.id === formData.tiendaAsignada);
    const closeModal = () => {
      setShowNuevoEmpleado(false);
      setEditingEmpleado(null);
      setFormData(FORM_EMPTY);
    };

    if (editingEmpleado) {
      const result = await empleadoService.update(editingEmpleado.uid, {
        ...formData,
        nombre,
        salarioDiario: formData.salarioDiario ? parseFloat(formData.salarioDiario) : null,
        tiendaNombre: tiendaSeleccionada?.nombre || '',
      });
      if (result.success) {
        closeModal();
        fetchData();
        if (selectedEmpleado?.uid === editingEmpleado.uid) {
          setSelectedEmpleado(prev => ({
            ...prev, ...formData, nombre,
            salarioDiario: formData.salarioDiario ? parseFloat(formData.salarioDiario) : null,
            tiendaNombre: tiendaSeleccionada?.nombre || '',
          }));
        }
        registroActividadService.registrar({
          tiendaId: formData.tiendaAsignada || '',
          tiendaNombre: tiendaSeleccionada?.nombre || '',
          accion: 'empleado_editado',
          descripcion: `Empleado "${nombre}" actualizado`,
          realizadoPor: currentUser?.nombre || 'Sistema',
          realizadoPorId: currentUser?.uid || '',
        });
      } else {
        showToast('Error: ' + result.error);
      }
    } else {
      const result = await empleadoService.create({
        ...formData,
        nombre,
        salarioDiario: formData.salarioDiario ? parseFloat(formData.salarioDiario) : null,
        tiendaNombre: tiendaSeleccionada?.nombre || '',
        creadoPorUid: currentUser?.uid,
        creadoPorNombre: currentUser?.nombre,
      });
      if (result.success && result.tempPassword) {
        setTempPassword(result.tempPassword);
        closeModal();
        fetchData();
        registroActividadService.registrar({
          tiendaId: formData.tiendaAsignada || '',
          tiendaNombre: tiendaSeleccionada?.nombre || '',
          accion: 'empleado_creado',
          descripcion: `Empleado "${nombre}" creado con rol ${formData.rol}`,
          realizadoPor: currentUser?.nombre || 'Sistema',
          realizadoPorId: currentUser?.uid || '',
        });
      } else if (result.success) {
        closeModal();
        fetchData();
        registroActividadService.registrar({
          tiendaId: formData.tiendaAsignada || '',
          tiendaNombre: tiendaSeleccionada?.nombre || '',
          accion: 'empleado_creado',
          descripcion: `Empleado "${nombre}" creado con rol ${formData.rol}`,
          realizadoPor: currentUser?.nombre || 'Sistema',
          realizadoPorId: currentUser?.uid || '',
        });
      } else {
        showToast('Error: ' + result.error);
      }
    }
  };

  const [tareaData, setTareaData] = useState({
    titulo: '',
    notas: '',
    prioridad: 'media',
    fechaLimite: '',
  });

  const handleGuardarTarea = async () => {
    if (!tareaData.titulo) {
      showToast('El título es requerido');
      return;
    }

    try {
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');

      await addDoc(collection(db, 'tareas'), {
        titulo: tareaData.titulo,
        notas: tareaData.notas,
        prioridad: tareaData.prioridad,
        fechaLimite: tareaData.fechaLimite || null,
        asignadoA: selectedEmpleado?.nombre,
        asignadoId: selectedEmpleado?.uid,
        creadoPor: currentUser?.nombre,
        creadoPorRol: currentUser?.rol,
        completada: false,
        createdAt: serverTimestamp(),
      });

      setShowNuevaTarea(false);
      setTareaData({ titulo: '', notas: '', prioridad: 'media', fechaLimite: '' });
      showToast('Tarea creada');
    } catch (error) {
      console.error('Error creando tarea:', error);
      showToast('Error al crear tarea');
    }
  };

  if (!isManager) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <i className="bi bi-lock-fill" style={{ fontSize: 48, marginBottom: 16 }}></i>
        <p>No tienes acceso a esta sección</p>
      </div>
    );
  }

  return (
    <div className={`inicio-page${selectedEmpleado ? ' inicio-card-open' : ''}`}>
      <div className="inicio-inner">
        {selectedEmpleado ? (
          <EmpleadoDetalle
            empleado={selectedEmpleado}
            tiendas={tiendas}
            onEdit={() => handleEdit(selectedEmpleado)}
            onNuevaTarea={() => setShowNuevaTarea(true)}
            onBack={() => setSelectedEmpleado(null)}
          />
        ) : (
          <>
            <header className="inicio-header">
              <h1>Staff</h1>
              <div className="staff-header-actions">
                {canEdit && (
                  <button className="staff-add-btn" onClick={() => { setFormData(FORM_EMPTY); setEditingEmpleado(null); setShowNuevoEmpleado(true); }} aria-label="Nuevo empleado">
                    <i className="bi bi-plus-lg"></i>
                  </button>
                )}
              </div>
            </header>

            {loading ? (
              <div className="inicio-spinner" />
            ) : empleados.length === 0 ? (
              <div className="inicio-padded staff-empty">No hay empleados</div>
            ) : (
              <>
                {currentUser && (() => {
                  const yo = empleados.find(e => e.uid === currentUser.uid);
                  if (!yo) return null;
                  return (
                    <section className="inicio-section">
                      <div className="inicio-section-head">
                        <h2>Yo</h2>
                      </div>
                      <div className="inicio-carousel inicio-carousel--tight">
                        <StaffHeroCard emp={yo} tienda={getTiendaById(yo.tiendaAsignada || yo.tiendaId)} yo onOpen={handleSelect} onContext={handleContextMenu} />
                      </div>
                    </section>
                  );
                })()}

                {ROL_GROUPS.map(group => {
                  const showYo = currentUser;
                  const emps = empleados.filter(e =>
                    group.roles.includes((e.rol || '').toUpperCase()) &&
                    !(showYo && e.uid === currentUser?.uid)
                  );
                  if (emps.length === 0) return null;
                  return (
                    <section key={group.key} className="inicio-section">
                      <div className="inicio-section-head">
                        <h2>{group.label}</h2>
                        <span className="staff-section-count">{emps.length}</span>
                      </div>
                      <div className="inicio-carousel inicio-carousel--tight">
                        {emps.map(emp => (
                          <StaffHeroCard key={emp.id || emp.uid} emp={emp} tienda={getTiendaById(emp.tiendaAsignada || emp.tiendaId)} onOpen={handleSelect} onContext={handleContextMenu} />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>

      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'white',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '4px 0',
            minWidth: 160,
            zIndex: 1000,
          }}
        >
          <div
            onClick={() => handleEdit(contextMenu.empleado)}
            style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <i className="bi bi-pencil" style={{ fontSize: 14 }}></i> Editar
          </div>
          <div
            onClick={() => handleToggleActivo(contextMenu.empleado)}
            style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <i className="bi bi-toggle-on" style={{ fontSize: 14 }}></i>
            {contextMenu.empleado.activo !== false ? 'Desactivar' : 'Reactivar'}
          </div>
        </div>
      )}

      {showNuevoEmpleado && (() => {
        /* ── helpers de diseño ── */
        const IS = { /* input style */
          width: '100%', boxSizing: 'border-box', padding: '10px 12px',
          border: '1.5px solid #E5E7EB', borderRadius: 10, fontSize: 13.5,
          color: '#111827', background: '#FAFAFA', outline: 'none',
          transition: 'border-color .15s',
        };
        const F = ({ label, required, children, half }) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: half ? 'span 1' : undefined }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {label}{required && <span style={{ color: 'var(--role-primary)', marginLeft: 3 }}>*</span>}
            </label>
            {children}
          </div>
        );
        const Inp = ({ label, type = 'text', fkey, required, style: sx }) => (
          <F label={label} required={required}>
            <input type={type} value={formData[fkey]} onChange={e => fd(fkey, e.target.value)}
              style={{ ...IS, ...sx }} />
          </F>
        );
        const Sel = ({ label, fkey, opts, required }) => (
          <F label={label} required={required}>
            <select value={formData[fkey]} onChange={e => fd(fkey, e.target.value)}
              style={{ ...IS, color: formData[fkey] ? '#111827' : '#9CA3AF' }}>
              <option value="">—</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </F>
        );
        const Sec = ({ icon, title }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 14,
            paddingBottom: 10, borderBottom: '1.5px solid #F3F4F6' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--role-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`bi bi-${icon}`} style={{ fontSize: 13, color: 'white' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{title}</span>
          </div>
        );
        const G2 = ({ children }) => (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
        );
        const G3 = ({ children }) => (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>{children}</div>
        );

        /* avatar preview */
        const initials = [formData.nombrePrimero?.[0], formData.apellidoPaterno?.[0]]
          .filter(Boolean).join('').toUpperCase() || '?';
        const canSave = formData.nombrePrimero && formData.apellidoPaterno && formData.numEmpleado;

        return (
          <div className="modal-overlay" onClick={() => { setShowNuevoEmpleado(false); setEditingEmpleado(null); setFormData(FORM_EMPTY); }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'white', borderRadius: 20,
              width: '92%', maxWidth: 560, maxHeight: '92vh',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
              overflow: 'hidden',
            }}>

              {/* ── HEADER ── */}
              <div style={{
                background: 'linear-gradient(135deg, var(--role-dark) 0%, var(--role-primary) 100%)',
                padding: '20px 24px 24px', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                      {editingEmpleado ? 'Editar empleado' : 'Nuevo registro'}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>
                      {formData.nombrePrimero || formData.apellidoPaterno
                        ? [formData.nombrePrimero, formData.apellidoPaterno].filter(Boolean).join(' ')
                        : editingEmpleado ? 'Editar Empleado' : 'Nuevo Empleado'}
                    </div>
                  </div>
                  <button onClick={() => { setShowNuevoEmpleado(false); setEditingEmpleado(null); setFormData(FORM_EMPTY); }} style={{
                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 10,
                    width: 32, height: 32, cursor: 'pointer', color: 'white', fontSize: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>✕</button>
                </div>
                {/* Avatar */}
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)', border: '2.5px solid rgba(255,255,255,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: -1, flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>
                      {formData.numEmpleado ? `EMP-${formData.numEmpleado}` : 'Núm. empleado'}
                    </div>
                    <div style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                      background: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700,
                      color: 'white', textTransform: 'capitalize',
                    }}>
                      {(formData.rol || 'STAFF').toLowerCase()}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── BODY ── */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 24px' }}>

                <Sec icon="person-badge" title="Identificación" />
                <G2>
                  <Inp label="Nombre(s)" fkey="nombrePrimero" required />
                  <Inp label="Apellido Paterno" fkey="apellidoPaterno" required />
                </G2>
                <div style={{ marginTop: 12 }} />
                <G2>
                  <Inp label="Apellido Materno" fkey="apellidoMaterno" />
                  <Inp label="Núm. Empleado" fkey="numEmpleado" required />
                </G2>
                <div style={{ marginTop: 12 }} />
                <Inp label="Teléfono" type="tel" fkey="telefono" />

                <Sec icon="shield-lock" title="Acceso al sistema" />
                <G2>
                  <F label="Rol" required>
                    <select value={formData.rol} onChange={e => fd('rol', e.target.value)} style={IS}>
                      <option value="STAFF">Staff</option>
                      <option value="MANAGER">Manager</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </F>
                  <F label="Sucursal asignada">
                    <select value={formData.tiendaAsignada} onChange={e => fd('tiendaAsignada', e.target.value)}
                      style={{ ...IS, color: formData.tiendaAsignada ? '#111827' : '#9CA3AF' }}>
                      <option value="">Sin asignar</option>
                      {tiendas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </F>
                </G2>

                <Sec icon="person-lines-fill" title="Datos personales" />
                <G2>
                  <Inp label="Fecha de nacimiento" type="date" fkey="fechaNacimiento" />
                  <Sel label="Sexo" fkey="sexo" opts={['Masculino','Femenino','Otro']} />
                </G2>
                <div style={{ marginTop: 12 }} />
                <G3>
                  <Sel label="Estado civil" fkey="estadoCivil" opts={['Soltero(a)','Casado(a)','Divorciado(a)','Viudo(a)','Unión libre']} />
                  <Sel label="Tipo de sangre" fkey="tipoSangre" opts={['A+','A-','B+','B-','AB+','AB-','O+','O-']} />
                  <Sel label="Nivel de estudios" fkey="nivelEstudios" opts={['Primaria','Secundaria','Preparatoria','Técnico','Licenciatura','Maestría','Doctorado']} />
                </G3>
                <div style={{ marginTop: 12 }} />
                <G2>
                  <Inp label="Nacionalidad" fkey="nacionalidad" />
                  <Inp label="Lugar de nacimiento" fkey="lugarNacimiento" />
                </G2>

                <Sec icon="card-text" title="Documentos oficiales" />
                <Inp label="CURP" fkey="curp" style={{ textTransform: 'uppercase' }} />
                <div style={{ marginTop: 12 }} />
                <G2>
                  <Inp label="RFC" fkey="rfc" style={{ textTransform: 'uppercase' }} />
                  <Inp label="NSS" fkey="nss" />
                </G2>

                <Sec icon="briefcase" title="Datos laborales" />
                <G2>
                  <Sel label="Tipo de contrato" fkey="tipoContrato" opts={['Indefinido','Temporal','Por obra','Por honorarios','Pasante']} />
                  <Inp label="Salario diario (MXN)" type="number" fkey="salarioDiario" />
                </G2>

                <Sec icon="bank" title="Datos bancarios" />
                <G2>
                  <Sel label="Banco" fkey="banco" opts={['BBVA','Banamex','Santander','Banorte','HSBC','Scotiabank','Inbursa','Afirme','BanBajío','Otro']} />
                  <Inp label="CLABE (18 dígitos)" fkey="clabe" />
                </G2>

                <Sec icon="telephone-plus" title="Contacto de emergencia" />
                <Inp label="Nombre completo" fkey="contactoEmergenciaNombre" />
                <div style={{ marginTop: 12 }} />
                <G2>
                  <Inp label="Teléfono" type="tel" fkey="contactoEmergenciaTelefono" />
                  <Inp label="Parentesco" fkey="contactoEmergenciaParentesco" />
                </G2>
              </div>

              {/* ── FOOTER ── */}
              <div style={{
                flexShrink: 0, padding: '14px 24px',
                borderTop: '1.5px solid #F3F4F6',
                background: 'white',
                display: 'flex', gap: 10,
              }}>
                <button onClick={() => { setShowNuevoEmpleado(false); setEditingEmpleado(null); setFormData(FORM_EMPTY); }} style={{
                  flex: 1, padding: '11px 0', border: '1.5px solid #E5E7EB', borderRadius: 12,
                  background: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151',
                }}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={!canSave} style={{
                  flex: 2, padding: '11px 0', border: 'none', borderRadius: 12,
                  background: canSave
                    ? 'linear-gradient(135deg, var(--role-dark) 0%, var(--role-primary) 100%)'
                    : '#E5E7EB',
                  color: canSave ? 'white' : '#9CA3AF',
                  fontSize: 14, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed',
                  transition: 'opacity .15s',
                }}>
                  <i className="bi bi-check2-circle" style={{ marginRight: 7 }} />
                  {editingEmpleado ? 'Guardar cambios' : 'Guardar empleado'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showNuevaTarea && (
        <div className="modal-overlay" onClick={() => setShowNuevaTarea(false)}>
          <div className="confirm-modal" style={{ maxWidth: 400, textAlign: 'left' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 20 }}>Nueva Tarea</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <input type="text" placeholder="Título *" value={tareaData.titulo} onChange={e => setTareaData({...tareaData, titulo: e.target.value})} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }} />
              <textarea placeholder="Notas" value={tareaData.notas} onChange={e => setTareaData({...tareaData, notas: e.target.value})} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, minHeight: 80 }} />
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Prioridad</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'baja', color: '#3B82F6' },
                    { key: 'media', color: '#F0A500' },
                    { key: 'alta', color: '#E63946' },
                    { key: 'urgente', color: '#B91C1C' },
                  ].map(({ key: p, color }) => (
                    <button
                      key={p}
                      onClick={() => setTareaData({...tareaData, prioridad: p})}
                      style={{
                        flex: 1,
                        padding: 8,
                        border: `1px solid ${tareaData.prioridad === p ? color : 'var(--border)'}`,
                        borderRadius: 6,
                        background: tareaData.prioridad === p ? color : 'white',
                        color: tareaData.prioridad === p ? 'white' : 'var(--text-muted)',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                        fontSize: 12,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <input type="date" value={tareaData.fechaLimite} onChange={e => setTareaData({...tareaData, fechaLimite: e.target.value})} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={() => setShowNuevaTarea(false)} className="btn btn-outline-secondary" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={handleGuardarTarea} className="btn btn-primary" style={{ flex: 1, background: 'var(--role-primary)' }}>Crear tarea</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: 'white', padding: '10px 20px',
          borderRadius: 10, fontSize: 14, fontWeight: 500,
          zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', whiteSpace: 'nowrap'
        }}>
          {toast}
        </div>
      )}

      {tempPassword && (
        <div className="modal-overlay" onClick={() => setTempPassword(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center' }}>
              <i className="bi bi-key" style={{ fontSize: 48, color: '#F59E0B', marginBottom: 16 }}></i>
              <h3>Contraseña Temporal</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Esta contraseña solo se mostrará una vez:</p>
              <div style={{ background: '#FEF3C7', padding: 16, borderRadius: 8, fontSize: 24, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 2 }}>
                {tempPassword}
              </div>
              <button onClick={() => setTempPassword(null)} className="btn btn-primary" style={{ marginTop: 20, background: 'var(--role-primary)' }}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Empleados;
