const DailyRoster = require("../../src/models/dining/DailyRoster"); // Apne model path se update kar lena

exports.checkItemAvailability = async (req, res) => {
  try {
    const { itemId } = req.params;
    console.log("......",itemId)

    // Aaj ki date ki range nikal rahe hai (00:00:00 se 23:59:59 tak)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    // Aaj ka roster find karo
    const roster = await DailyRoster.findOne({
      date: { $gte: startOfDay, $lt: endOfDay }
    });

    if (!roster) {
      return res.status(200).json({ 
        isAvailable: false, 
        message: "No roster configured for today." 
      });
    }

    // Roster me item dhundo
    const itemInRoster = roster.items.find(
      (i) => i.id.toString() === itemId
    );

    // Agar item roster me nahi hai ya quantity 0 hai
    if (!itemInRoster || itemInRoster.quantity <= 0) {
      return res.status(200).json({ 
        isAvailable: false, 
        message: "Item not available today." 
      });
    }

    // Available hai
    return res.status(200).json({ 
      isAvailable: true, 
      message: "Item available." 
    });

  } catch (error) {
    console.error("Availability Check Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};