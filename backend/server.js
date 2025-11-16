const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const Razorpay = require("razorpay");
const cors = require("cors");
const crypto = require("crypto");
const User = require("./models/Users.js");
const Order = require("./models/Orders.js");
require("dotenv").config();

const app = express();
const PORT = 5000;
const maxAge = 3 * 24 * 60 * 60;
const JWT_SECRET = "yoursecretkey"; // Replace with env var in prod

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS CONFIGURATION
app.use(
  cors({
    origin: "http://localhost:3000", // React app address
    credentials: true, // Allow cookies, authorization headers, etc.
  })
);
// MongoDB Connection
mongoose
  .connect("mongodb://127.0.0.1:27017/myappdb", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

// Routes

app.post("/create-order", async (req, res) => {
  try {
    const razorpay = new Razorpay({
      key_id: "rzp_test_i5KJt0JAzXNsyV",
      key_secret: "qyAMpAqppXRI3xgnx9YrU8Yv",
    });

    const options = {
      amount: req.body.amount * 100, // Convert amount to paise
      currency: req.body.currency,
      receipt: req.body.receipt,
      payment_capture: 1, // Auto capture payment
      method: "upi", // Enable UPI
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
});

app.post("/validate-payment", async (req, res) => {
  console.log("validate");

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  const secret = process.env.RAZORPAY_SECRET;
  if (!secret) {
    return res.status(500).json({ msg: "Server error: Missing secret key" });
  }

  const sha = crypto.createHmac("sha256", secret);
  sha.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const digest = sha.digest("hex");

  // Secure comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(digest, "utf-8"),
    Buffer.from(razorpay_signature, "utf-8")
  );

  if (!isValid) {
    return res.status(400).json({ msg: "Transaction is not legit!" });
  }

  res.json({
    msg: "success",
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
  });
});

app.post("/orderSuccess", async (req, res) => {
  const { orderId, paymentId, userId, cart, price } = req.body;
  console.log(orderId);
  console.log(paymentId);
  console.log(cart);
  console.log(userId);

  const newOrder = new Order({
    orderId: orderId,
    paymentId: paymentId,
    userId: userId,
    cartItems: cart,
    totalAmount: price,
  });
  
  newOrder
    .save()
    .then(async(order) => {
      console.log("Order saved:", order);
      Order.findOne({
        orderId: orderId,
        paymentId: paymentId,
      })
        .then((existingOrder) => {
          if (!existingOrder) {
            return res.status(404).json({ msg: "Order not found" });
          }

          res.json({
            msg: "success",
            OrderId: existingOrder._id,
          });
        })
        .catch((error) => {
          console.error("Error fetching order:", error);
          res.json({ msg: "failure" });
        });
    })
    .catch((err) => {
      console.error("Error saving order:", err);
      res.json({ msg: "failure" });
    });
  // res.json({ msg: "success", OrderId: existingOrder._id });
});

// Signup
app.post("/signup", async (req, res) => {
  console.log("signup");
  const { username, password } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(hashedPassword);
    const newUser = new User({
      username,
      password: hashedPassword,
    });

    await newUser.save();

    res.json({ message: "User registered successfully" });
  } catch (err) {
    console.error(err); // 👈 Logs the error to the console
    res.status(500).json({ message: "Server error" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  console.log("login");
  try {
    const user = await User.findOne({ username });
    console.log(user)
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    // Generate JWT
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: maxAge,
    });
    console.log(token);

    // Send token as cookie
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: maxAge,
    });

    res.json({ message: "Logged in successfully", user: user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});
// Route: GET /api/users/:id
app.get("/api/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId); // Mongoose example
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Protected route
app.get("/home", (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({
      message: "Welcome to the protected Home Page!",
      userId: decoded.userId,
    });
  } catch (err) {
    res.status(401).json({ message: "Token expired or invalid" });
  }
});

app.get("/orders/:userId", async (req, res) => {
  console.log("orders route")
  const userId = req.params.userId;
  const Orders = await Order.find({userId:userId});
  res.json({orders:Orders, msg:"success"});
})

// Logout
app.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
