const express = require('express');
const { createClient } = require('redis');
const app = express();
app.use(express.json());

const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        connectTimeout: 10000,
        reconnectStrategy: retries => Math.min(retries * 100, 3000)
    }
});

client.on('error', err => console.error('Error de Redis:', err));

async function conectar() {
    if (!client.isOpen) await client.connect();
}

// AUTH LOGIN
app.post('/api/auth/login', (req, res) => {
    const { usuario, password } = req.body;
    const adminUser = process.env.ADMIN_USER || 'Admin';
    const adminPass = process.env.ADMIN_PASS || 'mateomartino';
    if (usuario === adminUser && password === adminPass) {
        const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
        res.json({ ok: true, token, expiry: Date.now() + 8 * 60 * 60 * 1000 });
    } else {
        res.status(401).json({ ok: false, message: 'Usuario o contraseña incorrectos.' });
    }
});

// OBTENER TODOS LOS SOCIOS
app.get('/api/socios/todos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('socio:*');
        const socios = await Promise.all(keys.map(async k => JSON.parse(await client.get(k))));
        res.json(socios.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// REGISTRAR NUEVO
app.post('/api/registrar', async (req, res) => {
    try {
        await conectar();
        const { primerPago, ...socio } = req.body;
        if (!socio.fechaInicio) socio.fechaInicio = new Date().toISOString();
        await client.set(`socio:${socio.dni}`, JSON.stringify(socio));

        // Guardar primer pago en historial si se proporcionó monto
        if (primerPago && primerPago.monto) {
            const fechaPago = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
            const ahora = new Date();
            const mes   = ahora.toLocaleString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
            const anio  = ahora.toLocaleString('es-AR', { year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
            const pagos = [{
                id:       Date.now(),
                fecha:    fechaPago,
                concepto: primerPago.concepto || `Mensual ${mes} ${anio}`,
                monto:    primerPago.monto,
                metodo:   primerPago.metodo || 'Efectivo',
                estado:   'Pagado'
            }];
            await client.set(`pagos:${socio.dni}`, JSON.stringify(pagos));
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// RUTA PARA ACTUALIZAR EL PAGO (COBRAR MES) - VERSIÓN REDIS
app.post('/api/socios/cobrar', async (req, res) => {
    const { dni, nuevaFecha, pago } = req.body;

    try {
        await conectar();
        const datosSocioJSON = await client.get(`socio:${dni}`);

        if (datosSocioJSON) {
            const socio = JSON.parse(datosSocioJSON);
            socio.fechaInicio = nuevaFecha;
            socio.estado = 'Activo';
            await client.set(`socio:${dni}`, JSON.stringify(socio));

            // Registrar pago con los datos del modal (o valores por defecto)
            const rawPagos = await client.get(`pagos:${dni}`);
            const pagos = rawPagos ? JSON.parse(rawPagos) : [];
            const ahora = new Date();
            const mes   = ahora.toLocaleString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
            const anio  = ahora.toLocaleString('es-AR', { year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
            const fechaPago = ahora.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
            pagos.unshift({
                id: Date.now(),
                fecha: fechaPago,
                concepto: pago?.concepto || `Mensual ${mes} ${anio}`,
                monto:    pago?.monto    || '',
                metodo:   pago?.metodo   || 'Efectivo',
                estado:   'Pagado'
            });
            await client.set(`pagos:${dni}`, JSON.stringify(pagos));

            res.status(200).json({ success: true, mensaje: "Pago actualizado con éxito" });
        } else {
            res.status(404).json({ mensaje: "No se encontró el socio" });
        }
    } catch (error) {
        console.error("Error al cobrar:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// ACTUALIZAR (EDITAR O RENOVAR PAGO)
app.put('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        await client.set(`socio:${req.params.dni}`, JSON.stringify(req.body));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Error al actualizar" });
    }
});

// OBTENER PAGOS DE UN SOCIO
app.get('/api/socios/:dni/pagos', async (req, res) => {
    try {
        await conectar();
        const raw = await client.get(`pagos:${req.params.dni}`);
        res.json(raw ? JSON.parse(raw) : []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// REGISTRAR PAGO MANUAL
app.post('/api/socios/:dni/pagos', async (req, res) => {
    try {
        await conectar();
        const raw = await client.get(`pagos:${req.params.dni}`);
        const pagos = raw ? JSON.parse(raw) : [];
        const nuevo = {
            id: Date.now(),
            fecha: req.body.fecha || new Date().toLocaleDateString('es-AR'),
            concepto: req.body.concepto || 'Mensual',
            monto: req.body.monto || '',
            metodo: req.body.metodo || 'Efectivo',
            estado: req.body.estado || 'Pagado'
        };
        pagos.unshift(nuevo);
        await client.set(`pagos:${req.params.dni}`, JSON.stringify(pagos));
        res.json({ success: true, pago: nuevo });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// CHECK-IN SOCIO (pantalla de acceso)
app.get('/api/checkin/:dni', async (req, res) => {
    try {
        await conectar();
        const raw = await client.get(`socio:${req.params.dni}`);
        if (!raw) return res.status(404).json({ estado: 'NO_ENCONTRADO', message: 'Socio no encontrado.' });

        const socio = JSON.parse(raw);
        const desde = new Date(socio.fechaInicio || socio.fechaPago);
        const hasta = new Date(desde);
        hasta.setDate(desde.getDate() + 30);
        const hoy = new Date(); hoy.setHours(0,0,0,0);

        if (socio.estado === 'Suspendido') {
            return res.json({ estado: 'VENCIDO', message: `Membresía suspendida para ${socio.nombre}.` });
        }
        if (hoy > hasta) {
            return res.json({ estado: 'VENCIDO', message: `Membresía vencida para ${socio.nombre}. Por favor regularizá tu situación.` });
        }

        // Guardar asistencia en Redis
        const fechaHoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        const horaAhora = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' });
        const claveAsist = `asistencia:${fechaHoy}`;
        const existente = await client.get(claveAsist);
        const registros = existente ? JSON.parse(existente) : [];
        registros.push({ dni: socio.dni, nombre: socio.nombre, hora: horaAhora });
        await client.set(claveAsist, JSON.stringify(registros));
        // Expirar en 35 días para no acumular indefinidamente
        await client.expire(claveAsist, 35 * 24 * 60 * 60);

        res.json({ estado: 'OK', message: `¡Hola ${socio.nombre}! Bienvenido al gym.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ASISTENCIA ÚLTIMOS 7 DÍAS
app.get('/api/asistencia', async (req, res) => {
    try {
        await conectar();
        const resultado = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const fecha = d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
            const raw = await client.get(`asistencia:${fecha}`);
            const registros = raw ? JSON.parse(raw) : [];
            const diasSemana = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
            resultado.push({ dia: diasSemana[d.getDay()], fecha, cantidad: registros.length });
        }
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// EQUIPOS
app.get('/api/equipos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('equipo:*');
        const equipos = await Promise.all(keys.map(async k => JSON.parse(await client.get(k))));
        res.json(equipos.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/equipos', async (req, res) => {
    try {
        await conectar();
        const equipo = { id: Date.now(), ...req.body };
        await client.set(`equipo:${equipo.id}`, JSON.stringify(equipo));
        res.json({ success: true, equipo });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/equipos/:id', async (req, res) => {
    try {
        await conectar();
        await client.del(`equipo:${req.params.id}`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// INGRESOS DEL MES (para KPI Dashboard)
app.get('/api/dashboard/ingresos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('pagos:*');

        const ahora = new Date();
        const mesActual  = ahora.getMonth();
        const anioActual = ahora.getFullYear();

        // Mes anterior
        const fechaMesAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
        const mesAnterior  = fechaMesAnt.getMonth();
        const anioAnterior = fechaMesAnt.getFullYear();

        let totalMesActual  = 0;
        let totalMesAnterior = 0;

        for (const key of keys) {
            const raw = await client.get(key);
            if (!raw) continue;
            const pagos = JSON.parse(raw);
            for (const p of pagos) {
                if (!p.monto) continue;
                // monto puede ser "$15.000" o "15000" o 15000
                const num = parseFloat(String(p.monto).replace(/[$.]/g, '').replace(',', '.'));
                if (isNaN(num)) continue;

                // fecha guardada como dd/mm/aaaa
                const partes = String(p.fecha).split('/');
                if (partes.length !== 3) continue;
                const d = parseInt(partes[0], 10);
                const m = parseInt(partes[1], 10) - 1; // 0-based
                const a = parseInt(partes[2], 10);

                if (m === mesActual  && a === anioActual)  totalMesActual  += num;
                if (m === mesAnterior && a === anioAnterior) totalMesAnterior += num;
            }
        }

        res.json({ mesActual: totalMesActual, mesAnterior: totalMesAnterior });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ELIMINAR SOCIO
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        const dniRequerido = String(req.params.dni).trim();

        // Primero intentamos borrar por la clave directa
        const resultado = await client.del(`socio:${dniRequerido}`);
        if (resultado >= 1) {
            return res.json({ success: true, mensaje: "Socio eliminado" });
        }

        // Si no se encontró, buscamos entre todas las claves
        // (por si la clave fue guardada con espacios u otro formato)
        const keys = await client.keys('socio:*');
        for (const key of keys) {
            const data = JSON.parse(await client.get(key));
            if (data && String(data.dni).trim() === dniRequerido) {
                await client.del(key);
                return res.json({ success: true, mensaje: "Socio eliminado" });
            }
        }

        res.status(404).json({ error: "Socio no encontrado" });
    } catch (e) {
        console.error("Error al eliminar:", e);
        res.status(500).json({ error: "Error interno" });
    }
});

module.exports = app;