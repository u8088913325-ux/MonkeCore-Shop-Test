const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    project: "Monke Core Shop Test"
  });
});

app.post("/api/test-checkout", (req, res) => {
  const { packageId } = req.body;

  const packages = {
    checker: {
      name: "Checker Pack",
      price: "€1.99",
      role: "Checker Access"
    },
    utility: {
      name: "Utility Pack",
      price: "€5.99",
      role: "Utility Access"
    },
    allaccess: {
      name: "All Access Pack",
      price: "€7.99",
      role: "All Access"
    }
  };

  const selectedPackage = packages[packageId];

  if (!selectedPackage) {
    return res.status(400).json({
      success: false,
      message: "Invalid package selected."
    });
  }

  return res.json({
    success: true,
    testMode: true,
    message: "Test checkout completed. Discord role connection will be added later.",
    package: selectedPackage
  });
});

app.listen(PORT, () => {
  console.log(`Monke Core Shop Test is running on http://localhost:${PORT}`);
});