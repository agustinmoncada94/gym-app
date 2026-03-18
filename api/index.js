const express = require('express');
const { kv } = require('@vercel/kv');
const app = express();

// Importante para que Vercel sirva los archivos de la carpeta public
app.use(express.static('public'));
app.use(express.json());

// --- RUTA 1: Registro de Socios (Para el Admin) ---
app.post('/api/registrar', async (req, res) => {
    const { nombre, dni, nacimiento, direccion, telefono } = req.body;

    // Validación básica para evitar guardar datos vacíos
    if (!dni || !nombre) {
        return res.status(400).json({ error: "Faltan datos obligatorios (Nombre y DNI)" });
    }

    const nuevoSocio = {
        nombre,
        dni,
        nacimiento,
        direccion,
        telefono,
        fechaPago: new Date().toISOString(),
        activo: true
    };

    try {
        // Guardamos en KV usando el DNI como clave única
        await kv.set(`socio:${dni}`, nuevoSocio);
        // Enviamos una respuesta clara. Usamos "message" para evitar el undefined
        res.status(201).json({ message: "Socio registrado con éxito", socio: nuevoSocio });
    } catch (error) {
        console.error("Error KV:", error);
        res.status(500).json({ error: "Error al guardar en la base de datos" });
    }
});

// --- RUTA 2: Check-in (Para el Usuario) ---
app.get('/api/checkin/:dni', async (req, res) => {
    const { dni } = req.params;
    
    try {
        const socio = await kv.get(`socio:${dni}`);

        if (!socio) {
            return res.status(404).json({ message: "DNI no encontrado" });
        }

        const hoy = new Date();
        const fechaPago = new Date(socio.fechaPago);
        const vencimiento = new Date(fechaPago);
        vencimiento.setDate(vencimiento.getDate() + 30);

        if (hoy > vencimiento) {
            res.json({ 
                estado: "VENCIDO", 
                message: `Cuota vencida el ${vencimiento.toLocaleDateString()}.` 
            });
        } else {
            res.json({ 
                estado: "OK", 
                message: `¡Hola ${socio.nombre}! Acceso concedido.` 
            });
        }
    } catch (error) {
        res.status(500).json({ error: "Error al consultar datos" });
    }
});

// Esto es necesario para que funcione localmente y en Vercel
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Servidor listo en http://localhost:${PORT}`);
    });
}

module.exports = app;