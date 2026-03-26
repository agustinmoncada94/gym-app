const express = require('express');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

// Creamos el cliente usando la variable que ya tienes en Vercel
const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', err => console.log('Error en Redis:', err));

async function conectarRedis() {
    if (!client.isOpen) await client.connect();
}

// RUTA: Obtener todos los socios
app.get('/api/socios/todos', async (req, res) => {
    try {
        await conectarRedis();
        const keys = await client.keys('socio:*');
        if (!keys.length) return res.json([]);

        const socios = await Promise.all(
            keys.map(async (key) => {
                const data = await client.get(key);
                return JSON.parse(data);
            })
        );
        // Ordenamos alfabéticamente por nombre
        socios.sort((a, b) => a.nombre.localeCompare(b.nombre));
        res.json(socios);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener la lista" });
    }
});

// RUTA: Registrar nuevo socio (con todos los campos)
app.post('/api/registrar', async (req, res) => {
    try {
        await conectarRedis();
        const socio = req.body; 
        // Agregamos fecha de registro automáticamente
        socio.fechaRegistro = new Date().toISOString();
        
        await client.set(`socio:${socio.dni}`, JSON.stringify(socio));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error al guardar el socio" });
    }
});

// RUTA: Eliminar socio
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await conectarRedis();
        await client.del(`socio:${req.params.dni}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar" });
    }
});

module.exports = app;