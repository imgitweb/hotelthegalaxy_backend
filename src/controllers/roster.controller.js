// const DailyRoster = require("../../src/models/dining/DailyRoster"); // Apne model path se update kar lena

// exports.checkItemAvailability = async (req, res) => {
//   try {
//     const { itemId } = req.params;
//     console.log("......",itemId)

//     // Aaj ki date ki range nikal rahe hai (00:00:00 se 23:59:59 tak)
//     const startOfDay = new Date();
//     startOfDay.setHours(0, 0, 0, 0);
    
//     const endOfDay = new Date(startOfDay);
//     endOfDay.setDate(endOfDay.getDate() + 1);

//     // Aaj ka roster find karo
//     const roster = await DailyRoster.findOne({
//       date: { $gte: startOfDay, $lt: endOfDay }
//     });

//     if (!roster) {
//       return res.status(200).json({ 
//         isAvailable: false, 
//         message: "No roster configured for today." 
//       });
//     }

//     // Roster me item dhundo
//     const itemInRoster = roster.items.find(
//       (i) => i.id.toString() === itemId
//     );

//     // Agar item roster me nahi hai ya quantity 0 hai
//     if (!itemInRoster || itemInRoster.quantity <= 0) {
//       return res.status(200).json({ 
//         isAvailable: false, 
//         message: "Item not available today." 
//       });
//     }

//     // Available hai
//     return res.status(200).json({ 
//       isAvailable: true, 
//       message: "Item available." 
//     });

//   } catch (error) {
//     console.error("Availability Check Error:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };


const DailyRoster = require("../../src/models/dining/DailyRoster"); // Apne model path se update kar lena

exports.checkItemAvailability = async (req, res) => {
  try {
    const { itemId } = req.params;
    console.log("Checking availability for itemId:", itemId);

    // 1. Timezone Fix: Server chahe kisi bhi timezone me ho, hum perfect IST Midnight nikalenge
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in ms
    const istTime = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + istOffset);
    
    // Start of Day in IST (UTC me ye exactly pichle din ki 18:30:00 banti hai, jo aapke DB me save hai)
    const startOfDay = new Date(Date.UTC(istTime.getFullYear(), istTime.getMonth(), istTime.getDate() - 1, 18, 30, 0));
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    console.log("DB Date Range Search:", startOfDay, "to", endOfDay);

    // Aaj ka roster find karo
    const roster = await DailyRoster.findOne({
      date: { $gte: startOfDay, $lt: endOfDay }
    });

    if (!roster) {
      console.log("Error: Aaj ka roster nahi mila DB me!");
      return res.status(200).json({ 
        isAvailable: false, 
        message: "No roster configured for today." 
      });
    }

    // 2. Mongoose ID Fix: 'i.id' galti se '_id' return kar deta hai Mongoose me. 
    // Isliye ._doc ko use karte hai jisse original database value mile.
    const itemInRoster = roster.items.find((i) => {
      // Safely extracting the custom 'id' property directly from the raw document
      const currentItemId = i._doc && i._doc.id ? i._doc.id.toString() : i.id.toString();
      return currentItemId === itemId;
    });

    // Agar item roster me nahi hai ya quantity 0 hai
    if (!itemInRoster || itemInRoster.quantity <= 0) {
      console.log("Item Roster me nahi hai, ya quantity 0 hai.");
      return res.status(200).json({ 
        isAvailable: false, 
        message: "Item not available today." 
      });
    }

    // Available hai
    console.log(`Success: Item available hai. Quantity bachi hai: ${itemInRoster.quantity}`);
    return res.status(200).json({ 
      isAvailable: true, 
      message: "Item available." 
    });

  } catch (error) {
    console.error("Availability Check Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};