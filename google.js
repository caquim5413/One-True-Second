const CLIENT_ID =
"373825108562-1aadhtifvjtu4bj5qstqm88li80umag7.apps.googleusercontent.com";

const SCOPES =
"https://www.googleapis.com/auth/drive.file";

let tokenClient;
let accessToken = null;

// Esta función la llama index.html en cuanto el script de Google
// (accounts.google.com/gsi/client) termina de cargar de verdad.
// Así evitamos el error "google is not defined".
function initGoogleClient() {

    tokenClient = google.accounts.oauth2.initTokenClient({

        client_id: CLIENT_ID,

        scope: SCOPES,

        callback: async (response) => {

            accessToken = response.access_token;

            drive.setAccessToken(accessToken);

            const loginButton = document.getElementById("google-login");
            loginButton.textContent = "Conectando con Drive...";
            loginButton.disabled = true;

            await drive.init();

            loginButton.textContent = "Conectado ✔";

            if (typeof onDriveReady === "function") {
                onDriveReady();
            }

        }

    });

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

});
