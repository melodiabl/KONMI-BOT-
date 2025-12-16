import 'dotenv/config';
import { connectToWhatsApp } from '../../whatsapp.js';

async function test() {
  try {
    console.log('Testing WhatsApp connection...');
    await connectToWhatsApp('./storage/test', false, null);
    console.log('Connection started successfully');
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();