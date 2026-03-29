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
    const { dni, nuevaFecha } = req.body;

    try {
        await conectar();
        
        // 1. Obtenemos los datos actuales del socio
        const datosSocioJSON = await client.get(`socio:${dni}`);
        
        if (datosSocioJSON) {
            const socio = JSON.parse(datosSocioJSON);
            
            // 2. Actualizamos la fecha de inicio y el estado
            socio.fechaInicio = nuevaFecha;
            socio.estado = 'Activo';
            
            // 3. Guardamos de nuevo en Redis
            await client.set(`socio:${dni}`, JSON.stringify(socio));
            
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

// ELIMINAR SOCIO
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        const dni = req.params.dni;
        
        // Borramos la clave específica en Redis
        const resultado = await client.del(`socio:${dni}`);
        
        if (resultado === 1) {
            res.json({ success: true, mensaje: "Socio eliminado" });
        } else {
            res.status(404).json({ error: "Socio no encontrado" });
        }
    } catch (e) {
        console.error("Error al eliminar:", e);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = app;