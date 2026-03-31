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
        const socio = req.body;
        if (!socio.fechaInicio) socio.fechaInicio = new Date().toISOString();
        await client.set(`socio:${socio.dni}`, JSON.stringify(socio));
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
            const fecha = new Date(nuevaFecha);
            const mes = fecha.toLocaleString('es-AR', { month: 'long' });
            const anio = fecha.getFullYear();
            pagos.unshift({
                id: Date.now(),
                fecha: fecha.toLocaleDateString('es-AR'),
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