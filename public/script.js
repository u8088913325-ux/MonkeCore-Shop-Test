const packageData = {
  checker: {
    icon: "🛡️",
    name: "Checker Pack",
    price: "€1.99",
    role: "Checker Access"
  },
  utility: {
    icon: "💻",
    name: "Utility Pack",
    price: "€5.99",
    role: "Utility Access"
  },
  allaccess: {
    icon: "📦",
    name: "All Access Pack",
    price: "€7.99",
    role: "All Access"
  }
};

let selectedPackageId = null;

function openCheckout(packageId) {
  selectedPackageId = packageId;

  const selectedPackage = packageData[packageId];

  document.getElementById("checkoutIcon").textContent = selectedPackage.icon;
  document.getElementById("checkoutName").textContent = selectedPackage.name;
  document.getElementById("checkoutPrice").textContent = selectedPackage.price;
  document.getElementById("checkoutResult").textContent = "";
  document.getElementById("agreeBox").checked = false;

  document.getElementById("checkoutModal").classList.remove("hidden");
}

function closeCheckout() {
  document.getElementById("checkoutModal").classList.add("hidden");
}

async function confirmCheckout() {
  const agreeBox = document.getElementById("agreeBox");
  const resultText = document.getElementById("checkoutResult");

  if (!agreeBox.checked) {
    resultText.style.color = "#ff7d7d";
    resultText.textContent = "Please confirm that you understand this is only a test checkout.";
    return;
  }

  if (!selectedPackageId) {
    resultText.style.color = "#ff7d7d";
    resultText.textContent = "No package selected.";
    return;
  }

  try {
    const response = await fetch("/api/test-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        packageId: selectedPackageId
      })
    });

    const data = await response.json();

    if (!data.success) {
      resultText.style.color = "#ff7d7d";
      resultText.textContent = data.message || "Something went wrong.";
      return;
    }

    resultText.style.color = "#7dffad";
    resultText.innerHTML = `
      Test checkout completed.<br>
      Selected: ${data.package.name}<br>
      Role later: ${data.package.role}<br><br>
      Discord role connection will be added next.
    `;
  } catch (error) {
    resultText.style.color = "#ff7d7d";
    resultText.textContent = "Server error. Make sure the Node.js server is running.";
  }
}

function openDiscordInfo() {
  alert("Later, this button can open your Monke Core Discord invite link.");
}