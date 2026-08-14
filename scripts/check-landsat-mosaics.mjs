#!/usr/bin/env node
/** Fail the build if Year-mode Landsat mosaics are missing (slider would start at 2016). */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'public/data/landsat')
const indexPath = path.join(dir, 'index.json')
const jpg1972 = path.join(dir, '1972.jpg')

if (!fs.existsSync(indexPath) || !fs.existsSync(jpg1972)) {
  console.error('Missing Landsat mosaics in public/data/landsat (need index.json and 1972.jpg).')
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
if (!data.years?.['1972']?.file) {
  console.error('public/data/landsat/index.json has no 1972 mosaic.')
  process.exit(1)
}
const mosaic = path.join(dir, data.years['1972'].file)
if (!fs.existsSync(mosaic)) {
  console.error(`Missing mosaic file ${mosaic}`)
  process.exit(1)
}
