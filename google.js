const CLIENT_ID =
"373825108562-1aadhtifvjtu4bj5qstqm88li80umag7.apps.googleusercontent.com";

const SCOPES =
"https://www.googleapis.com/auth/drive.file";

const TOKEN_STORAGE_KEY = "ots_google_token";
const HAS_LOGGED_IN_KEY = "ots_has_logged_in";

let tokenClient;
let accessToken = null;
let renewTimer = null;

// ---------- Guardar / leer / borrar el token en el navegador ----------

function saveTokenToStorage(token, expiresInSeconds) {

    const record = {
        access_token: token,
        expires_at: Date.now() + (expiresInSeconds * 1000)
    };

    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(record));
    localStorage.setItem(HAS_LOGGED_IN_KEY, "1");

}

function getStoredToken() {

    const record = readTokenRecord();

    if (!record) return null;

    if (Date.now() > record.expires_at - 60000) {
        return null;
    }

    return record.access_token;

}

function readTokenRecord() {

    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);

    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return null;
    }

}

function clearStoredToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// ---------- Renovación automática y silenciosa ----------
// Un poco antes de que el token caduque (dura ~1 hora), pedimos uno
// nuevo en silencio, sin que el usuario vea ni haga nada. Mientras la
// pestaña siga abierta y la sesión de Google siga activa, esto hace
// que en la práctica no haga falta volver a iniciar sesión nunca.

function scheduleRenewal(expiresInSeconds) {

    clearTimeout(renewTimer);

    // Renovamos 5 minutos antes de que caduque de verdad
    const renewInMs = Math.max((expiresInSeconds - 300) * 1000, 10000);

    renewTimer = setTimeout(() => {

        if (tokenClient) {
            tokenClient.requestAccessToken({ prompt: "" });
        }

    }, renewInMs);

}

// ---------- Conectar con Drive con un token (nuevo o guardado) ----------

async function connectDrive(token) {

    const loginButton = document.getElementById("google-login");
    const logoutButton = document.getElementById("google-logout");

    loginButton.textContent = "Conectando con Drive...";

    try {

        accessToken = token;
        drive.setAccessToken(token);

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
function initGoogleClient() {

    tokenClient = google.accounts.oauth2.initTokenClient({

        client_id: CLIENT_ID,

        scope: SCOPES,

        callback: async (response) => {

            // Una renovación silenciosa puede fallar (por ejemplo, si
            // el usuario cerró sesión de Google del todo). En ese caso
            // simplemente dejamos el botón de "Iniciar sesión" normal,
            // sin molestar con una alerta.
            if (response.error) {
                console.warn("No se pudo renovar la sesión en silencio:", response.error);
                return;
            }

            saveTokenToStorage(
                response.access_token,
                response.expires_in
            );

            scheduleRenewal(response.expires_in);

            await connectDrive(response.access_token);

        }

    });

    const stored = getStoredToken();

    if (stored) {

        // Sesión guardada y todavía válida: entramos directo
        connectDrive(stored);

        const record = readTokenRecord();
        const remainingSeconds = Math.floor((record.expires_at - Date.now()) / 1000);

        scheduleRenewal(remainingSeconds);

    } else if (localStorage.getItem(HAS_LOGGED_IN_KEY)) {

        // Ya habíamos iniciado sesión antes en este navegador:
        // intentamos renovar en silencio, sin pedir clic.
        tokenClient.requestAccessToken({ prompt: "" });

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

            clearTimeout(renewTimer);
            clearStoredToken();
            localStorage.removeItem(HAS_LOGGED_IN_KEY);

            if (token && google.accounts?.oauth2?.revoke) {

                google.accounts.oauth2.revoke(token, () => {
                    location.reload();
                });

            } else {

                location.reload();

            }

        });

});
