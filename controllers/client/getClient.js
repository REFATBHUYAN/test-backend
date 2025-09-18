import Client from "../../model/clientModal.js";

// Get all clients
export const getClient = async (req, res) => {

    try {
        const clients = await Client.find({ companyId: req.params.id });
        res.json(clients);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
};
