import { default as Client } from "../../model/clientModal.js";


// Get all clients for a specific company
export async function getClientsByCompany(req, res) {
  const { companyId } = req.params;
  try {
    const clients = await Client.find({ companyId });
    res.json(clients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
}

// Get a single client by ID and companyId
export async function getClient(req, res) {
  const { id, companyId } = req.params;
  try {
    const client = await Client.findOne({ _id: id, companyId });
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }
    res.json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
}

// Create a new client for a specific company
export async function createClient(req, res) {
  const { companyId } = req.params;
  const { companyName, address, website, phone, notes, primaryContact } = req.body;

  const client = new Client({
    companyId,
    companyName,
    address,
    website,
    phone,
    notes,
    primaryContact,
  });

  try {
    const newClient = await client.save();
    res.status(201).json(newClient);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Invalid client data' });
  }
}

// Update an existing client by ID and companyId
export async function updateClient(req, res) {
  const { id, companyId } = req.params;
  const updates = req.body;

  try {
    const client = await Client.findOneAndUpdate(
      { _id: id, companyId },
      updates,
      { new: true, runValidators: true }
    );

    if (!client) {
      return res.status(404).json({ message: 'Client not found or not authorized' });
    }

    res.json(client);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: 'Invalid client data' });
  }
}

// Delete a client by ID and companyId
export async function deleteClient(req, res) {
  const { id, companyId } = req.params;

  try {
    const client = await Client.findOneAndDelete({ _id: id, companyId });

    if (!client) {
      return res.status(404).json({ message: 'Client not found or not authorized' });
    }

    res.json({ message: 'Client deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
}
