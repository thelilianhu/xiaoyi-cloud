import {mkdirSync, readFileSync, writeFileSync, renameSync} from 'node:fs';
import {dirname} from 'node:path';

export class Store {
 constructor(file) {
  this.file = file;
  try {this.data = JSON.parse(readFileSync(file, 'utf8'));}
  catch (error) {if (error.code !== 'ENOENT') throw error; this.data = {sessions: {}, runs: {}};}
 }
 commit(update) {
  const next = structuredClone(this.data);
  update(next);
  mkdirSync(dirname(this.file), {recursive:true, mode:0o700});
  writeFileSync(this.file + '.tmp', JSON.stringify(next), {mode:0o600});
  renameSync(this.file + '.tmp', this.file);
  this.data = next;
 }
}
