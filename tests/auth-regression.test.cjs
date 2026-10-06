const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const Customer = require('../models/Customer');
process.env.OTP_HASH_SECRET = 'local-unit-test-only';
process.env.JWT_SECRET = 'local-unit-test-only';
const crypto = require('crypto');
const router = require('../routes/customerRoutes');
const handler = path => router.stack.find(layer => layer.route?.path === path).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, payload: null, status(n) {this.statusCode=n;return this;}, cookie() {return this;}, json(data) {this.payload=data;return this;} });
const otpHash = code => crypto.createHmac('sha256', process.env.OTP_HASH_SECRET).update(code).digest('hex');
const hook = Customer.schema.s.hooks._pres.get('save').find(h => h.fn.toString().includes('bcrypt.hash')).fn;

test('register then login matches the original password, including spaces', async () => {
  const originalFind = Customer.findOne;
  const password = ' exact-password-42 ';
  const customer = new Customer({firstName:'Test',lastName:'User',phone:'0500000000',email:'test@example.invalid',password:await bcrypt.hash(password, 12),pendingOtp:{hash:otpHash('123456'),expiresAt:new Date(Date.now()+60000),attempts:0}});
  customer.save = async () => { await hook.call(customer); return customer; };
  Customer.findOne = async () => customer;
  try {
    const registered = response();
    await handler('/auth/register/verify')({body:{email:customer.email,otp:'123456',password}},registered);
    assert.ok(registered.payload.user);
    assert.equal(await customer.comparePassword(password),true);
    const loggedIn = response();
    await handler('/auth/login')({body:{email:customer.email,password}},loggedIn);
    assert.ok(loggedIn.payload.user);
  } finally { Customer.findOne=originalFind; }
});

test('forgot-password rejects even a correct code once attempts are exhausted', async () => {
  const originalFind = Customer.findOne;
  Customer.findOne = async () => ({pendingOtp:{hash:otpHash('123456'),expiresAt:new Date(Date.now()+60000),attempts:5,cooldownUntil:new Date(Date.now()+300000)}});
  try {
    const res=response();
    await handler('/auth/forgot/verify')({body:{email:'test@example.invalid',otp:'123456',newPassword:'password42'}},res);
    assert.equal(res.statusCode,429); assert.equal(res.payload.code,'MAX_ATTEMPTS'); assert.ok(res.payload.cooldown>0);
  } finally {Customer.findOne=originalFind;}
});

test('password reset stores one hash and allows login with exact new password', async () => {
  const originalFind=Customer.findOne;
  const customer=new Customer({firstName:'Test',lastName:'User',phone:'0500000000',email:'test@example.invalid',password:'old-password',pendingOtp:{hash:otpHash('123456'),expiresAt:new Date(Date.now()+60000),attempts:0}});
  customer.save=async()=>{await hook.call(customer);return customer;};
  Customer.findOne=async()=>customer;
  try {
    const res=response();
    await handler('/auth/forgot/verify')({body:{email:customer.email,otp:'123456',newPassword:' new-password '}},res);
    assert.equal(res.payload.success,true);
    assert.equal(await customer.comparePassword(' new-password '),true);
    assert.equal(await customer.comparePassword('old-password'),false);
    assert.equal(customer.pendingOtp.hash,null);
  } finally {Customer.findOne=originalFind;}
});
