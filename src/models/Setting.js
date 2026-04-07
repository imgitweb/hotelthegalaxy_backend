const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    baseFee: 
    { 
        type: Number,
         default: 30
     },
     
     perKmRate: {
      type: Number,
      default: 10, // base distance ke baad per km charge
    },

    baseDistanceKm: {
      type: Number,
      default: 5, // base fee kitne km tak valid hai
    },

   
    minCharge: 
    { 
        type: Number, 
        default: 20 
    },
    maxCharge: 
    { 
        type: Number,
         default: 200
         },
    freeDeliveryAbove:
     { 
        type: Number, 
        default: 500
     },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Setting", settingSchema);
