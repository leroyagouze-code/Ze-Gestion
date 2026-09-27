INSERT INTO plans (code, name, monthly_price, currency, limits) VALUES
 ('FREE', 'Free', 0, 'XOF', '{"maxUsers":1,"maxProducts":100,"maxStores":1,"features":["pos","invoices"]}'),
 ('BASIC', 'Basic', 5000, 'XOF', '{"maxUsers":3,"maxProducts":2000,"maxStores":1,"features":["pos","invoices","reports","import"]}'),
 ('PRO', 'Pro', 15000, 'XOF', '{"maxUsers":10,"maxProducts":null,"maxStores":2,"features":["pos","invoices","reports","import","quotes","purchases"]}'),
 ('BUSINESS', 'Business', 35000, 'XOF', '{"maxUsers":null,"maxProducts":null,"maxStores":null,"features":["pos","invoices","reports","import","quotes","purchases","multistore","api"]}')
ON CONFLICT (code) DO NOTHING;
