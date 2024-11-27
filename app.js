const express = require('express'); //prueba
const session = require('express-session');
const mysql = require('mysql');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config({ path: './.env' });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/resources', express.static('public'));
app.use('/resources', express.static(__dirname + '/public'));

app.set('view engine', 'ejs');

app.use(
    session({
        secret: 'secret',
        resave: true,
        saveUninitialized: true,
    })
);

const connection = require('./db');

// Iniciar el servidor
app.listen(3000, () => {
    console.log('Servidor iniciado en http://localhost:3000');
});

// Middleware global para pasar el usuario logueado a las vistas
app.use((req, res, next) => {
    res.locals.user = req.session.loggedin ? req.session.user : null;
    next();
});

app.use((req, res, next) => {
    res.locals.user = req.session.loggedin ? req.session.user : undefined;
    next();
  });
  

// Middleware para verificar si el usuario está autenticado
function isAuthenticated(req, res, next) {
    if (req.session.loggedin) {
        next(); // Usuario autenticado, continuar
    } else {
        res.redirect('/login'); // Usuario no autenticado, redirigir al login
    }
}

// Middleware para verificar si el usuario es administrador
function isAdmin(req, res, next) {
    if (req.session.loggedin && req.session.user.rol_id === 1) {
        next(); // Usuario administrador, continuar
    } else {
        res.send('Acceso denegado: No tienes permisos para ver esta página');
    }
}

// Rutas públicas
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('login', {
        alert: '',
        alertClass: '',
    });
});

app.post('/auth', (req, res) => {
    const { user, pass } = req.body;

    connection.query('SELECT * FROM usuarios WHERE email = ?', [user], async (error, results) => {
        if (results.length === 0 || !(await bcrypt.compare(pass, results[0].password))) {
            // Si el usuario no existe o la contraseña es incorrecta
            return res.render('login', { 
                alert: 'Usuario o contraseña incorrectos', 
                alertClass: 'error' // Clase CSS para estilizar el mensaje de error
            });
        }

        // Si la autenticación es exitosa
        req.session.loggedin = true;
        req.session.user = results[0];
        res.redirect('/admin'); // Redirige a la página de administración
    });
});

// Rutas protegidas
app.get('/admin', isAuthenticated, (req, res) => {
    res.render('admin', { user: req.session.user });
});

app.get('/productos', isAuthenticated, (req, res) => {
    const query = `
        SELECT 
            p.*, 
            prov.nombre AS proveedor_nombre, 
            loc.nombre AS localizacion_nombre 
        FROM productos p
        LEFT JOIN proveedores prov ON p.proveedor_id = prov.id
        LEFT JOIN localizaciones loc ON p.localizacion_id = loc.id
    `;

    connection.query(query, (error, productos) => {
        if (error) throw error;

        connection.query('SELECT * FROM proveedores', (error, proveedores) => {
            if (error) throw error;

            connection.query('SELECT * FROM localizaciones', (error, localizaciones) => {
                if (error) throw error;

                res.render('productos', { productos, proveedores, localizaciones });
            });
        });
    });
});

app.post('/productos/agregar', isAuthenticated, (req, res) => {
    const { nombre, marca, precio, costo, medida, stock, stock_minimo, proveedor_id, localizacion_id, observaciones } = req.body;

    connection.query('INSERT INTO productos SET ?', { nombre, marca, precio, costo, medida, stock, stock_minimo, proveedor_id, localizacion_id, observaciones }, (error) => {
        if (error) throw error;
        res.redirect('/productos');
    });
});



// Ruta para productos bajo el nivel de stock mínimo
app.get('/productos/bajo-stock', isAuthenticated, (req, res) => {
    const stockMin = parseInt(req.query.stock_min, 10); // Obtén el valor del query param y asegúrate de que sea un número

    let query = 'SELECT * FROM productos WHERE stock < stock_minimo'; // Consulta predeterminada

    // Si se proporciona un stock mínimo personalizado
    if (!isNaN(stockMin)) {
        query = 'SELECT * FROM productos WHERE stock < ?';
    }

    connection.query(query, [stockMin], (error, productos) => {
        if (error) throw error;

        res.render('productos_bajo_stock', { productos });
    });
});


app.get('/proveedores', isAuthenticated, (req, res) => {
    connection.query('SELECT * FROM proveedores', (error, proveedores) => {
        if (error) throw error;
        res.render('proveedores', { proveedores });
    });
});

app.post('/proveedores/agregar', isAuthenticated, (req, res) => {
    const { nombre, telefono, web, email } = req.body;

    connection.query('INSERT INTO proveedores SET ?', { nombre, telefono, web, email }, (error) => {
        if (error) throw error;
        res.redirect('/proveedores');
    });
});

app.get('/localizaciones', isAuthenticated, (req, res) => {
    connection.query('SELECT * FROM localizaciones', (error, localizaciones) => {
        if (error) throw error;
        res.render('localizaciones', { localizaciones });
    });
});

app.post('/localizaciones/agregar', isAuthenticated, (req, res) => {
    const { nombre } = req.body;

    connection.query('INSERT INTO localizaciones SET ?', { nombre }, (error) => {
        if (error) throw error;
        res.redirect('/localizaciones');
    });
});

app.get('/categorias', isAuthenticated, (req, res) => {
    connection.query('SELECT * FROM categorias', (error, categorias) => {
        if (error) throw error;
        res.render('categorias', { categorias });
    });
});

app.post('/categorias/agregar', isAuthenticated, (req, res) => {
    const { nombre } = req.body;

    connection.query('INSERT INTO categorias SET ?', { nombre }, (error) => {
        if (error) throw error;
        res.redirect('/categorias');
    });
});

app.get('/usuarios', isAdmin, (req, res) => {
    connection.query('SELECT * FROM usuarios', (error, usuarios) => {
        if (error) throw error;
        res.render('usuarios', { usuarios });
    });
});

app.post('/usuarios/agregar', isAdmin, async (req, res) => {
    const { nombre, apellidos, email, telefono, rol_id, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 8);

    connection.query('INSERT INTO usuarios SET ?', { nombre, apellidos, email, telefono, rol_id, password: hashedPassword }, (error) => {
        if (error) throw error;
        res.redirect('/usuarios');
    });
});

// Ruta para cerrar sesión
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err);
            return res.redirect('/admin'); 
        }
        res.redirect('/login');
    });
});
