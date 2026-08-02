# MongoDB DNS Troubleshooting Report

## Current symptom

The backend and seed command fail to resolve the MongoDB Atlas SRV record:

```text
querySrv ECONNREFUSED _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

The failure occurs during DNS SRV lookup, before MongoDB authentication or database access.

## Environment

- Backend: `online-store-backend`
- MongoDB driver: Mongoose from the backend dependencies
- Atlas cluster hostname: `cluster0.7pxhir8.mongodb.net`
- Wi-Fi adapter: `Realtek 8822CE Wireless LAN 802.11ac PCI-E NIC`
- Network: `Minh Thanh 5G`

No credentials or connection-string secrets are recorded here.

## Steps completed

### 1. Checked the active network adapter

```powershell
Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | Format-Table -AutoSize Name, InterfaceDescription, Status
```

Result: the active adapter is named `Wi-Fi`.

### 2. Set IPv4 DNS servers

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses ("1.1.1.1","8.8.8.8")
```

The command completed without an error.

### 3. Cleared the Windows DNS cache

```powershell
ipconfig /flushdns
```

Result:

```text
Successfully flushed the DNS Resolver Cache.
```

### 4. Tested the default Windows resolver

```powershell
nslookup -type=SRV _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

Initial result: no response from the configured IPv6 Google DNS server (`2001:4860:4860::8888`).

### 5. Tested Cloudflare DNS directly

```powershell
nslookup -type=SRV _mongodb._tcp.cluster0.7pxhir8.mongodb.net 1.1.1.1
```

Result: successful response with all three Atlas SRV targets:

- `ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net:27017`
- `ac-24ykmxh-shard-00-01.7pxhir8.mongodb.net:27017`
- `ac-24ykmxh-shard-00-02.7pxhir8.mongodb.net:27017`

This confirmed that Atlas is reachable through Cloudflare DNS and that the hostname is valid.

### 6. Configured IPv4 and IPv6 Cloudflare DNS

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses ("1.1.1.1","1.0.0.1","2606:4700:4700::1111","2606:4700:4700::1001")
```

The IPv6 resolver still returned no response.

### 7. Temporarily disabled IPv6 on the Wi-Fi adapter

```powershell
Disable-NetAdapterBinding -Name "Wi-Fi" -ComponentID ms_tcpip6
```

After clearing the cache, the normal `nslookup` command succeeded through `1.1.1.1` and returned all three Atlas SRV targets.

### 8. Tested Node.js DNS resolution directly

Without overriding DNS, Node.js failed:

```powershell
node -e "require('dns').promises.resolveSrv('_mongodb._tcp.cluster0.7pxhir8.mongodb.net').then(console.log).catch(err => console.error(err))"
```

Result: `querySrv ECONNREFUSED`.

With Cloudflare DNS explicitly configured inside Node.js, the same lookup succeeded:

```powershell
node -e "const dns=require('dns'); dns.setServers(['1.1.1.1','1.0.0.1']); dns.promises.resolveSrv('_mongodb._tcp.cluster0.7pxhir8.mongodb.net').then(console.log).catch(console.error)"
```

Result: all three Atlas SRV targets were returned.

### 9. Tested Mongoose with the project `.env`

A direct Mongoose connection using dotenv, Cloudflare DNS, and the same connection options as the application succeeded:

```powershell
node -e "require('dotenv').config(); const dns=require('dns'); dns.setServers(['1.1.1.1','1.0.0.1']); const mongoose=require('mongoose'); mongoose.connect(process.env.MONGO_URI,{maxPoolSize:10,minPoolSize:5,serverSelectionTimeoutMS:8000,socketTimeoutMS:45000,connectTimeoutMS:8000,retryWrites:true,w:'majority',family:4}).then(()=>{console.log('CONNECTED');return mongoose.disconnect()}).catch(err=>{console.error(err.message);process.exitCode=1})"
```

Result:

```text
CONNECTED
```

This confirms that the `.env` connection string, MongoDB credentials, Atlas IP access, DNS override, and Mongoose options can work together in a minimal process.

### 10. Ran the application and seed command

`npm start` continued to report `querySrv ECONNREFUSED`.

`npm run seed` also failed with the same SRV error:

```text
Seeding failed with error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

The seed entry point currently imports Mongoose at `src/seeds/index.js:7` and does not configure a DNS resolver before that import.

## Code change made during investigation

The following lines were added near the beginning of `src/app.js`, before the Mongoose import:

```js
const dns = require('dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);
```

This change has not yet resolved the application or seed command failure. No further code changes were made after the requested pause.

## Current conclusion

1. MongoDB Atlas itself is responding correctly.
2. The Atlas IP access list is not the current cause.
3. Windows `nslookup` works when Cloudflare IPv4 DNS is used.
4. Node.js SRV lookup fails with the default resolver but succeeds when DNS is explicitly set in a minimal process.
5. Direct Mongoose testing succeeds with the project environment and connection options.
6. The remaining issue is specific to the application/seed process initialization or the resolver used by the MongoDB driver in those entry points.
7. `src/seeds/index.js` definitely needs to be considered separately because it imports Mongoose without the DNS setup used in the direct test.

## Not yet done

- No fallback non-SRV MongoDB URI has been generated.
- No changes have been made to the seed entry point.
- No changes have been made to retry logic.
- No credentials or `.env` values have been exposed.
