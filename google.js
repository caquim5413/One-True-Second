const CLIENT_ID =
"373825108562-1aadhtifvjtu4bj5qstqm88li80umag7.apps.googleusercontent.com";

const SCOPES =
"https://www.googleapis.com/auth/drive.file";

const TOKEN_STORAGE_KEY = "ots_google_token";

let tokenClient;
let accessToken = null;

// ---------- Guardar / leer / borrar el token en el navegador ----------
// Así no hace falta volver a iniciar sesión cada vez que se recarga
// la página. El token de Google dura aprox. 1 hora; pasado ese tiempo
// habrá que pulsar "Iniciar sesión" de nuevo (es normal y seguro).

function saveTokenToStorage(token, expiresInSeconds) {

    const record = {
        access_token: token,
        expires_at: Date.now() + (expiresInSeconds * 1000)
    };

    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(record));

}

function getStoredToken() {

    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);

    if (!raw) return null;

    let record;

    try {
        record = JSON.parse(raw);
    } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return null;
    }

    // Margen de 1 minuto de seguridad antes de la caducidad real
    if (Date.now() > record.expires_at - 60000) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return null;
    }

    return record.access_token;

}

function clearStoredToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// ---------- Conectar con Drive con un token (nuevo o guardado) ----------

async function connectDrive(token) {

    accessToken = token;
    drive.setAccessToken(token);

    const loginButton = document.getElementById("google-login");
    const logoutButton = document.getElementById("google-logout");

    loginButton.textContent = "Conectando con Drive...";

    try {

        await drive.init();

        loginButton.style.display = "none";
        logoutButton.style.display = "inline-block";

        if (typeof onDriveReady === "function") {
            onDriveReady();
        }

    } catch (err) {

        console.error("No se pudo conectar con Drive:", err);

        clearStoredToken();

        loginButton.textContent = "Iniciar sesión con Google";
        loginButton.style.display = "inline-block";
        logoutButton.style.display = "none";

    }

}

// Esta función la llama index.html en cuanto el script de Google
// (accounts.google.com/gsi/client) termina de cargar de verdad.
// Así evitamos el error "google is not defined".
function initGoogleClient() {

    tokenClient = google.accounts.oauth2.initTokenClient({

        client_id: CLIENT_ID,

        scope: SCOPES,

        callback: async (response) => {

            saveTokenToStorage(
                response.access_token,
                response.expires_in
            );

            await connectDrive(response.access_token);

        }

    });

    // Si ya había una sesión guardada y todavía no ha caducado,
    // entramos directamente sin pedir clic en el botón.
    const stored = getStoredToken();

    if (stored) {
        connectDrive(stored);
    }

}

document.addEventListener("DOMContentLoaded", () => {

    document
        .getElementById("google-login")
        .addEventListener("click", () => {

            if (!tokenClient) {
                alert("Google todavía se está cargando, espera un segundo y vuelve a pulsar.");
                return;
            }

            tokenClient.requestAccessToken({
                prompt: "consent"
            });

        });

    document
        .getElementById("google-logout")
        .addEventListener("click", () => {

            const token = accessToken;

            clearStoredToken();

            if (token && google.accounts?.oauth2?.revoke) {

                google.accounts.oauth2.revoke(token, () => {
                    location.reload();
                });

            } else {

                location.reload();

            }

        });

});
