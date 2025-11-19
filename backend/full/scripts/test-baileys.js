import baileys from '@itsukichan/baileys';
import qrcode from 'qrcode-terminal';

// =================================================================================================
//
//  HOW TO USE THIS SCRIPT
//
//  1. Make sure you have installed the necessary dependencies by running `npm install` in the `backend/full` directory.
//  2. Run the script from the root of the repository using the following command:
//     node backend/full/scripts/test-baileys.js
//  3. The script will generate a QR code in the terminal. Scan this QR code with your phone to connect to WhatsApp.
//  4. Once the connection is established, the script will send a test message to the phone number you provide.
//     You will be prompted to enter the phone number in the terminal.
//
// =================================================================================================

async function connectToWhatsApp() {
  const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = baileys;
  console.log(baileys);
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
      // reconnect if not logged out
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('opened connection');
      // send a message after 5 seconds
      setTimeout(() => {
        const readline = import('readline').then(m => m.createInterface({
          input: process.stdin,
          output: process.stdout,
        }));
        readline.then(rl => {
          rl.question('Please enter the phone number to send the message to (e.g., 1234567890): ', (phoneNumber) => {
            sock.sendMessage(`${phoneNumber}@s.whatsapp.net`, { text: 'Hello from Baileys!' });
            rl.close();
          });
        });
      }, 5000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();
