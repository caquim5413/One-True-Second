const CLIENT_ID =
"373825108562-1aadhtifvjtu4bj5qstqm88li80umag7.apps.googleusercontent.com";

// Añadimos el scope de perfil para poder mostrar la foto y el nombre
const SCOPES =
"https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile";

const TOKEN_STORAGE_KEY = "ots_google_token";
const HAS_LOGGED_IN_KEY = "ots_has_logged_in";
const PROFILE_STORAGE_KEY = "ots_profile";

let tokenClient;
let accessToken = null;
let renewTimer = null;
let isLoggedIn = false;

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

// ---------- Perfil (nombre y foto) ----------

async function fetchAndShowProfile(token) {

    try {

        const response = await fetch(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) throw new Error("No se pudo obtener el perfil.");

        const profile = await response.json();

        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));

        showProfileUI(profile);

    } catch (err) {
        console.error("No se pudo cargar el perfil:", err);
    }

}

function showProfileUI(profile) {

    const avatar = document.getElementById("profile-avatar");
    const placeholder = document.getElementById("profile-placeholder");
    const nameLabel = document.getElementById("profile-name");

    if (profile?.picture) {
        avatar.src = profile.picture;
        avatar.style.display = "block";
        placeholder.style.display = "none";
    }

    if (profile?.name) {
        nameLabel.textContent = profile.name;
    }

}

function resetProfileUI() {

    const avatar = document.getElementById("profile-avatar");
    const placeholder = document.getElementById("profile-placeholder");
    const nameLabel = document.getElementById("profile-name");

    avatar.style.display = "none";
    avatar.src = "";
    placeholder.style.display = "block";
    nameLabel.textContent = "";

}

// ---------- Renovación automática y silenciosa ----------

function scheduleRenewal(expiresInSeconds) {

    clearTimeout(renewTimer);

    const renewInMs = Math.max((expiresInSeconds - 300) * 1000, 10000);

    renewTimer = setTimeout(() => {

        if (tokenClient) {
            tokenClient.requestAccessToken({ prompt: "" });
        }

    }, renewInMs);

}

// ---------- Conectar con Drive con un token (nuevo o guardado) ----------

async function connectDrive(token) {

    try {

        accessToken = token;
        drive.setAccessToken(token);

        await drive.init();

        isLoggedIn = true;
        document.getElementById("profile-btn").classList.add("connected");

        // Si teníamos el perfil guardado de antes, lo mostramos ya
        // mismo (rápido), y de paso lo refrescamos por si ha cambiado.
        const cachedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);

        if (cachedProfile) {
            try {
                showProfileUI(JSON.parse(cachedProfile));
            } catch {}
        }

        await fetchAndShowProfile(token);

        if (typeof onDriveReady === "function") {
            onDriveReady();
        }

    } catch (err) {

        console.error("No se pudo conectar con Drive:", err);

        isLoggedIn = false;
        clearStoredToken();
        resetProfileUI();
        document.getElementById("profile-btn").classList.remove("connected");

    }

}

// Esta función la llama index.html en cuanto el script de Google
// (accounts.google.com/gsi/client) termina de cargar de verdad.
function initGoogleClient() {

    tokenClient = google.accounts.oauth2.initTokenClient({

        client_id: CLIENT_ID,

        scope: SCOPES,

        callback: async (response) => {

            if (response.error) {
                console.warn("No se pudo iniciar/renovar la sesión:", response.error);
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

        connectDrive(stored);

        const record = readTokenRecord();
        const remainingSeconds = Math.floor((record.expires_at - Date.now()) / 1000);

        scheduleRenewal(remainingSeconds);

    } else if (localStorage.getItem(HAS_LOGGED_IN_KEY)) {

        tokenClient.requestAccessToken({ prompt: "" });

    }

}

// ---------- Botón de perfil (entrar / menú de salir) ----------

function toggleProfileMenu(forceState) {

    const menu = document.getElementById("profile-menu");

    const show = forceState !== undefined
        ? forceState
        : menu.style.display === "none";

    menu.style.display = show ? "flex" : "none";

}

document.addEventListener("DOMContentLoaded", () => {

    document
        .getElementById("profile-btn")
        .addEventListener("click", (event) => {

            event.stopPropagation();

            if (isLoggedIn) {

                toggleProfileMenu();
                return;

            }

            if (!tokenClient) {
                alert("Google todavía se está cargando, espera un segundo y vuelve a pulsar.");
                return;
            }

            tokenClient.requestAccessToken({
                prompt: "consent"
            });

        });

    // Cerrar el menú si se pulsa fuera de él
    document.addEventListener("click", (event) => {

        const menu = document.getElementById("profile-menu");
        const wrapper = document.getElementById("profile-wrapper");

        if (menu.style.display !== "none" && !wrapper.contains(event.target)) {
            toggleProfileMenu(false);
        }

    });

    document
        .getElementById("google-logout")
        .addEventListener("click", () => {

            const token = accessToken;

            clearTimeout(renewTimer);
            clearStoredToken();
            localStorage.removeItem(HAS_LOGGED_IN_KEY);
            localStorage.removeItem(PROFILE_STORAGE_KEY);

            toggleProfileMenu(false);

            if (token && google.accounts?.oauth2?.revoke) {

                google.accounts.oauth2.revoke(token, () => {
                    location.reload();
                });

            } else {

                location.reload();

            }

        });

});
