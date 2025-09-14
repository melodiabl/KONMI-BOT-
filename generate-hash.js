import bcrypt from 'bcryptjs';

const password = 'melodia@2010';
const hash = bcrypt.hashSync(password, 10);
console.log(hash);









