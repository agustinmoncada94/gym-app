const express = require('express');
const { createClient } = require('redis');
const app = express();
app.use(express.json());

// Configuración del cliente Redis Cloud
const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        connectTimeout: 10000,
        reconnectStrategy: retries => Math.min(retries * 100, 3000)
    }
});

client.on('error', err => console.error('Error de Redis:', err));

// Función auxiliar para asegurar la conexión
async function conectar() {
    if (!client.isOpen) await client.connect();
}

// 1. OBTENER TODOS LOS SOCIOS (Ordenados por nombre)
app.get('/api/socios/todos', async (req, res) => {
    try {
        await conectar();
        const keys = await client.keys('socio:*');
        const socios = await Promise.all(
            keys.map(async k => JSON.parse(await client.get(k)))
        );
        // Ordenar alfabéticamente antes de enviar
        res.json(socios.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. REGISTRAR SOCIO (POST)
app.post('/api/registrar', async (req, res) => {
    try {
        await conectar();
        const socio = req.body;
        // Si no viene fecha de inicio, la creamos ahora (ISO format)
        if (!socio.fechaInicio) {
            socio.fechaInicio = new Date().toISOString();
        }
        await client.set(`socio:${socio.dni}`, JSON.stringify(socio));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. ACTUALIZAR / RENOVAR PAGO (PUT)
// Esta ruta se usa tanto para editar datos como para el botón de "Renovar Mes"
app.put('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        const datosActualizados = req.body;
        await client.set(`socio:${req.params.dni}`, JSON.stringify(datosActualizados));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "No se pudo actualizar el socio" });
    }
});

// 4. ELIMINAR SOCIO (DELETE)
app.delete('/api/socios/:dni', async (req, res) => {
    try {
        await conectar();
        await client.del(`socio:${req.params.dni}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "No se pudo eliminar el registro" });
    }
});

// 5. RUTA DE CHECK-IN (Para la pantalla de entrada del gimnasio)
app.get('/api/checkin/:dni', async (req, res) => {
    try {
        await conectar();
        const data = await client.get(`socio:${req.params.dni}`);
        if (!data) return res.status(404).json({ message: "Socio no encontrado" });
        
        const socio = JSON.parse(data);
        
        // Lógica simple de vencimiento para el check-in
        const hoy = new Date();
        const vencimiento = new Date(socio.fechaInicio);
        vencimiento.setDate(vencimiento.getDate() + 30);
        
        const estaVencido = hoy > vencimiento;

        res.json({ 
            estado: estaVencido ? "VENCIDO" : "OK", 
            nombre: socio.nombre,
            mensaje: estaVencido ? "Cuota vencida, pasar por administración" : "¡Buen entrenamiento!"
        });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

module.exports = app;