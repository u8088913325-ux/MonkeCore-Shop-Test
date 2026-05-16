const packages = {
  checker: {
    name: "Checker Pack",
    price: "€1.99",
    icon: "🛡️"
  },
  utility: {
    name: "Utility Pack",
    price: "€5.99",
    icon: "💻"
  },
  allaccess: {
    name: "All Access Pack",
    price: "€7.99",
    icon: "📦"
  }
};

let selectedPackage = null;
let currentUser = null;

async function loadDiscordUser() {
  try {
    const response = await fetch("/api/me");
    const data = await response.json();

    currentUser = data.loggedIn ? data.user : null;
    updateDiscordLoginButton();
  } catch (error) {
    console.error("Could not load Discord user:", error);
  }
}

function updateDiscordLoginButton() {
  const button = document.getElementById("discordLoginButton");

  if (!button) return;

  if (currentUser) {
    button.textContent = `Connected: ${currentUser.globalName || currentUser.username}`;
    button.classList.add("connected");
  } else {
    button.textContent = "Authorize with Discord";
    button.classList.remove("connected");
  }
}

function openCheckout(packageId) {
  selectedPackage = packageId;

  const packageInfo = packages[packageId];

  if (!packageInfo) return;

  const checkoutModal = document.getElementById("checkoutModal");
  const checkoutIcon = document.getElementById("checkoutIcon");
  const checkoutName = document.getElementById("checkoutName");
  const checkoutPrice = document.getElementById("checkoutPrice");
  const checkoutResult = document.getElementById("checkoutResult");
  const agreeBox = document.getElementById("agreeBox");

  checkoutIcon.textContent = packageInfo.icon;
  checkoutName.textContent = packageInfo.name;
  checkoutPrice.textContent = packageInfo.price;
  checkoutResult.textContent = "";
  checkoutResult.className = "checkout-result";
  agreeBox.checked = false;

  checkoutModal.classList.remove("hidden");
}

function closeCheckout() {
  const checkoutModal = document.getElementById("checkoutModal");
  checkoutModal.classList.add("hidden");
}

async function confirmCheckout() {
  const checkoutResult = document.getElementById("checkoutResult");
  const agreeBox = document.getElementById("agreeBox");

  checkoutResult.className = "checkout-result";

  if (!selectedPackage) {
    checkoutResult.textContent = "Please select a package first.";
    checkoutResult.classList.add("error");
    return;
  }

  if (!agreeBox.checked) {
    checkoutResult.textContent = "Please confirm that you understand the Discord access.";
    checkoutResult.classList.add("error");
    return;
  }

  if (!currentUser) {
    checkoutResult.textContent = "Please authorize with Discord first.";
    checkoutResult.classList.add("error");

    setTimeout(() => {
      window.location.href = "/auth/discord";
    }, 1000);

    return;
  }

  checkoutResult.textContent = "Adding Discord role...";
  checkoutResult.classList.add("loading");

  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        packageId: selectedPackage
      })
    });

    const data = await response.json();

    checkoutResult.className = "checkout-result";

    if (!response.ok || !data.success) {
      checkoutResult.textContent = data.message || "Something went wrong.";
      checkoutResult.classList.add("error");
      return;
    }

    checkoutResult.textContent = data.message || "Access granted.";
    checkoutResult.classList.add("success");

    setTimeout(() => {
      window.location.href = "/discord";
    }, 1500);
  } catch (error) {
    console.error("Checkout error:", error);

    checkoutResult.className = "checkout-result";
    checkoutResult.textContent = "Could not connect to the shop system.";
    checkoutResult.classList.add("error");
  }
}

window.addEventListener("load", () => {
  loadDiscordUser();
});