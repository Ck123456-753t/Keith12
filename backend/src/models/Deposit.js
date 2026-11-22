const mongoose = require("mongoose");

const depositSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      maxlength: 100
    },

    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true
    },

    amountCents: {
      type: Number,
      required: true,
      validate: {
        validator(value) {
          if (!Number.isSafeInteger(value) || value < 10) return false;
          return this.paymentMode === "manual" || value % 10 === 0;
        },
        message:
          "Deposit cents must be a safe integer of at least 10 cents; M-Pesa deposits must be in 10-cent increments."
      }
    },

    currency: {
      type: String,
      enum: ["USD"],
      default: "USD",
      immutable: true,
      required: true
    },

    expectedAmountKes: {
      type: Number,
      required() {
        return this.paymentMode !== "manual";
      },
      default: null,
      min: 13,
      validate: {
        validator(value) {
          if (this.paymentMode === "manual") {
            return value === null || value === undefined;
          }

          return Number.isSafeInteger(value);
        },
        message: "Expected KSh amount must be a whole number."
      }
    },

    phoneNumber: {
      type: String,
      required() {
        return this.paymentMode !== "manual";
      },
      default: null,
      trim: true,
      match: /^254[17]\d{8}$/
    },

    paymentMode: {
      type: String,
      enum: ["daraja", "simulation", "manual"],
      default: "daraja",
      required: true,
      immutable: true
    },
    paymentReason: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 300,
      required() {
        return this.paymentMode === "manual";
      },
      default: undefined
    },
    paymentReference: {
      type: String,
      trim: true,
      maxlength: 160,
      default: ""
    },
    supportingDetails: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ""
    },
    stkInitiatedAt: {
      type: Date,
      default: null
    },

    // Set only after Daraja confirms that the STK request was accepted.
    // MongoDB physically removes the record 180 seconds after this date.
    expiresAt: {
      type: Date,
      default: null
    },

    status: {
      type: String,
      enum: ["pending", "completed", "approved", "rejected", "failed", "cancelled"],
      default: "pending",
      required: true
    },

    merchantRequestId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 150
    },

    checkoutRequestId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 150
    },

    mpesaReceipt: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      maxlength: 30
    },

    resultCode: {
      type: Number,
      default: null
    },

    resultDescription: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },

    walletTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

depositSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, name: "unique_user_deposit_idempotency" }
);

depositSchema.index(
  { userId: 1, createdAt: -1, _id: -1 },
  { name: "user_deposit_history" }
);

// Only expired pending deposits are physically deleted.
// Completed, failed, cancelled, simulated, and uncertain requests are preserved.
depositSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: {
      status: "pending",
      expiresAt: { $type: "date" }
    },
    name: "expire_pending_wallet_deposits"
  }
);

depositSchema.index(
  { checkoutRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      checkoutRequestId: { $type: "string" }
    },
    name: "unique_daraja_checkout_request"
  }
);

depositSchema.index(
  { mpesaReceipt: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "completed",
      mpesaReceipt: { $type: "string" }
    },
    name: "unique_completed_mpesa_receipt"
  }
);

module.exports = mongoose.model("Deposit", depositSchema);
