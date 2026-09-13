const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@adiwajshing/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const { state, saveState } = useSingleFileAuthState('./sessao.json');
const fs = require('fs');
const exec = require('child_process').exec;

function ligarBot() {
    const sock = makeWASocket({ auth: state, printQRInTerminal: true });
    sock.ev.on('creds.update', saveState);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('--- QR CODE GERADO ---');
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) ligarBot();
        } else if (connection === 'open') {
            console.log('🚀 SEU NÚMERO AGORA É UM BOT!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const type = Object.keys(msg.message)[0];

        if (type === 'imageMessage') {
            const legenda = msg.message.imageMessage.caption || '';
            if (legenda.toLowerCase() === '!f' || legenda.toLowerCase() === '!sticker') {
                await sock.sendMessage(from, { text: '🔄 Fazendo sua figurinha... Espera um pouquinho!' }, { quoted: msg });
                
                // Código simplificado que gerencia os arquivos nos bastidores
                const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await(const chunk of stream) { buffer = Buffer.concat([buffer, chunk]) }
                
                const nomeArquivo = `./${Date.now()}.jpg`;
                const nomeSticker = `./${Date.now()}.webp`;
                fs.writeFileSync(nomeArquivo, buffer);

                exec(`ffmpeg -i ${nomeArquivo} -vcodec libwebp -filter_complex "[0:v]scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=white@0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse" ${nomeSticker}`, async (err) => {
                    if (!err) {
                        await sock.sendMessage(from, { sticker: fs.readFileSync(nomeSticker) }, { quoted: msg });
                    }
                    if (fs.existsSync(nomeArquivo)) fs.unlinkSync(nomeArquivo);
                    if (fs.existsSync(nomeSticker)) fs.unlinkSync(nomeSticker);
                });
            }
        }
    });
}
ligarBot();
