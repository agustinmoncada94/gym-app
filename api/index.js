const express = require('express');
const { createClient } = require('redis');

const app = express();
app.use(express.json());

// Configuramos el cliente de Redis
const client = createClient({
    url: process.env.REDIS_URL
});

client.on('error', err => console.log('Redis Error:', err));

// Función para asegurar la conexión en cada pedido
async function conectar() {
    if (!client.isOpen) await client.connect();
}

// RUTA: LISTAR TODOS
app.get('/api/socios/todos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('socio:*');
        if (!keys.length) return res.json([]);

        const socios = await Promise.all(
            keys.map(async (key) => {
                const data = await client.get(key);
                return JSON.parse(data);
            })
        );
        res.json(socios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// RUTA: REGISTRAR
app.post('/api/registrar', async (req, res) => {
    try {
        await conectar();
        const socio = req.body;
        socio.fechaPago = new Date().toISOString();
        await client.set(`socio:${socio.dni}`, JSON.stringify(socio));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// RUTA: ELIMINAR
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        await client.del(`socio:${req.params.dni}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = app;