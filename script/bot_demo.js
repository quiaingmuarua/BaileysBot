// index.js
import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys"
import express from "express"

async function start() {
  // 使用多文件 auth 存储 (假设已经有 auth 文件)
  const {state, saveCreds} = await useMultiFileAuthState("AUTH/447999803105")

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // 第一次没登陆时可扫
  })
  sock.ev.on("creds.update", saveCreds)


}


start()

