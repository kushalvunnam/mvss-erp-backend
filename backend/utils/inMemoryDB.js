const bcrypt = require('bcryptjs');

const collections = {};
global.isInMemoryFallback = true;

// Helper to generate a random 24-character hex string (like MongoDB's ObjectId)
function generateId() {
  const chars = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * 16)];
  }
  return id;
}

// Deep clone helper
function deepClone(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

// Simple query matcher
function matchesQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;
  for (const key of Object.keys(query)) {
    const val = query[key];
    if (key === '$or') {
      if (!Array.isArray(val)) continue;
      let matched = false;
      for (const sub of val) {
        if (matchesQuery(doc, sub)) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
      continue;
    }
    
    // Support regex matching if val is a RegExp or an object with $regex
    if (val instanceof RegExp) {
      if (!val.test(doc[key])) return false;
      continue;
    } else if (val && typeof val === 'object' && val.$regex) {
      const flags = val.$options || '';
      const regex = new RegExp(val.$regex, flags);
      if (!regex.test(doc[key])) return false;
      continue;
    }

    // Support operators like $ne, $gt, $lt, $in
    if (val && typeof val === 'object') {
      if ('$ne' in val) {
        if (doc[key] === val.$ne || String(doc[key]) === String(val.$ne)) return false;
        continue;
      }
      if ('$in' in val) {
        if (!Array.isArray(val.$in)) continue;
        const matched = val.$in.some(item => doc[key] === item || String(doc[key]) === String(item));
        if (!matched) return false;
        continue;
      }
    }

    // Simple key-value matching
    if (doc[key] !== val && String(doc[key]) !== String(val)) {
      // Handle nested or reference object matching
      if (doc[key] && typeof doc[key] === 'object' && doc[key]._id && String(doc[key]._id) === String(val)) {
        continue;
      }
      return false;
    }
  }
  return true;
}

// Simple update applier
function applyUpdate(doc, update) {
  if (!update) return doc;
  const setObj = update.$set || update;
  for (const key of Object.keys(setObj)) {
    if (key.startsWith('$')) continue;
    doc[key] = setObj[key];
  }
  
  if (update.$push) {
    for (const key of Object.keys(update.$push)) {
      if (!Array.isArray(doc[key])) doc[key] = [];
      doc[key].push(update.$push[key]);
    }
  }
  
  if (update.$inc) {
    for (const key of Object.keys(update.$inc)) {
      doc[key] = (doc[key] || 0) + update.$inc[key];
    }
  }
  return doc;
}

// Query Chain for supporting .sort(), .limit(), .populate()
class QueryChain {
  constructor(modelName, filter = {}) {
    this.modelName = modelName;
    this.filter = filter;
    this._populatePaths = [];
    this._sortObj = null;
    this._limitVal = null;
    this._skipVal = null;
  }

  get data() {
    if (!collections[this.modelName]) {
      collections[this.modelName] = [];
    }
    let res = collections[this.modelName].filter(doc => matchesQuery(doc, this.filter));
    
    // Sort
    if (this._sortObj) {
      const key = Object.keys(this._sortObj)[0];
      const order = this._sortObj[key]; // 1 or -1
      res.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];
        if (typeof valA === 'string') {
          return order === 1 ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return order === 1 ? (valA - valB) : (valB - valA);
      });
    }

    // Skip
    if (this._skipVal !== null) {
      res = res.slice(this._skipVal);
    }

    // Limit
    if (this._limitVal !== null) {
      res = res.slice(0, this._limitVal);
    }

    // Populate (basic reference hydration)
    if (this._populatePaths.length > 0) {
      res = res.map(doc => {
        const cloned = deepClone(doc);
        for (const path of this._populatePaths) {
          const refId = cloned[path];
          if (refId) {
            // Find target collection based on common paths
            let targetColl = null;
            if (path === 'customerId') targetColl = 'Customer';
            else if (path === 'vehicleId') targetColl = 'Vehicle';
            else if (path === 'jobCardId') targetColl = 'JobCard';
            else if (path === 'estimateId') targetColl = 'Estimate';
            else if (path === 'serviceAdvisorId') targetColl = 'User';

            if (targetColl && collections[targetColl]) {
              const matchedRef = collections[targetColl].find(r => String(r._id) === String(refId));
              if (matchedRef) {
                cloned[path] = deepClone(matchedRef);
              }
            }
          }
        }
        return cloned;
      });
    }

    return res;
  }

  populate(path) {
    this._populatePaths.push(path);
    return this;
  }

  sort(sortObj) {
    this._sortObj = sortObj;
    return this;
  }

  limit(limitVal) {
    this._limitVal = limitVal;
    return this;
  }

  skip(skipVal) {
    this._skipVal = skipVal;
    return this;
  }

  select(fields) {
    return this;
  }

  then(onResolve, onReject) {
    return Promise.resolve(this.data).then(onResolve, onReject);
  }

  catch(onReject) {
    return Promise.resolve(this.data).catch(onReject);
  }
}

// Single Document instance wrapper
class MockDoc {
  constructor(modelName, data) {
    this._modelName = modelName;
    Object.assign(this, deepClone(data));
    if (!this._id) {
      this._id = generateId();
    }

    // Apply Schema defaults
    const schema = schemas[modelName];
    if (schema) {
      schema.eachPath((path, schemaType) => {
        if (this[path] === undefined && schemaType.defaultValue !== undefined) {
          if (typeof schemaType.defaultValue === 'function') {
            if (schemaType.defaultValue.name !== 'defaultId') {
              this[path] = schemaType.defaultValue();
            }
          } else {
            this[path] = schemaType.defaultValue;
          }
        }
      });
    }

    if (!this.createdAt) {
      this.createdAt = new Date().toISOString();
    }
    this.updatedAt = new Date().toISOString();
  }

  async save() {
    if (!collections[this._modelName]) {
      collections[this._modelName] = [];
    }
    
    // Password hashing for User
    if (this._modelName === 'User' && this.password && !this.password.startsWith('$2a$')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }

    const idx = collections[this._modelName].findIndex(d => String(d._id) === String(this._id));
    const rawData = {};
    for (const key of Object.keys(this)) {
      if (key.startsWith('_') && key !== '_id') continue;
      rawData[key] = this[key];
    }

    if (idx !== -1) {
      collections[this._modelName][idx] = rawData;
    } else {
      collections[this._modelName].push(rawData);
    }
    return this;
  }

  async comparePassword(candidatePassword) {
    if (this._modelName !== 'User') return false;
    return bcrypt.compare(candidatePassword, this.password);
  }

  toObject() {
    const rawData = {};
    for (const key of Object.keys(this)) {
      if (key.startsWith('_') && key !== '_id') continue;
      rawData[key] = this[key];
    }
    return deepClone(rawData);
  }

  toJSON() {
    return this.toObject();
  }
}

// Mock Model Class
function createMockModel(modelName) {
  if (!collections[modelName]) {
    collections[modelName] = [];
  }

  class MockModel {
    constructor(data) {
      return new MockDoc(modelName, data);
    }

    static get modelName() {
      return modelName;
    }

    static find(query = {}) {
      return new QueryChain(modelName, query);
    }

    static findOne(query = {}) {
      const list = collections[modelName].filter(doc => matchesQuery(doc, query));
      if (list.length === 0) {
        const nullResult = {
          populate: () => nullResult,
          select: () => nullResult,
          lean: () => nullResult,
          then: (resolve) => resolve(null)
        };
        return nullResult;
      }
      const inst = new MockDoc(modelName, list[0]);
      const chain = {
        populate: (path) => {
          let refId = inst[path];
          let targetColl = null;
          if (path === 'customerId') targetColl = 'Customer';
          else if (path === 'vehicleId') targetColl = 'Vehicle';
          else if (path === 'jobCardId') targetColl = 'JobCard';
          else if (path === 'estimateId') targetColl = 'Estimate';
          else if (path === 'serviceAdvisorId') targetColl = 'User';

          if (targetColl && collections[targetColl] && refId) {
            const matchedRef = collections[targetColl].find(r => String(r._id) === String(refId));
            if (matchedRef) {
              inst[path] = deepClone(matchedRef);
            }
          }
          return chain;
        },
        select: () => chain,
        lean: () => chain,
        then: (resolve) => resolve(inst)
      };
      return chain;
    }

    static findById(id) {
      return MockModel.findOne({ _id: id });
    }

    static async findByIdAndUpdate(id, update, options = {}) {
      const list = collections[modelName];
      const idx = list.findIndex(d => String(d._id) === String(id));
      if (idx === -1) return null;
      
      let updated = applyUpdate(list[idx], update);
      updated.updatedAt = new Date().toISOString();
      list[idx] = updated;
      return new MockDoc(modelName, updated);
    }

    static async findOneAndUpdate(query, update, options = {}) {
      const list = collections[modelName];
      const idx = list.findIndex(doc => matchesQuery(doc, query));
      if (idx === -1) return null;

      let updated = applyUpdate(list[idx], update);
      updated.updatedAt = new Date().toISOString();
      list[idx] = updated;
      return new MockDoc(modelName, updated);
    }

    static async findByIdAndDelete(id) {
      const list = collections[modelName];
      const idx = list.findIndex(d => String(d._id) === String(id));
      if (idx === -1) return null;
      const removed = list.splice(idx, 1)[0];
      return new MockDoc(modelName, removed);
    }

    static async findOneAndDelete(query) {
      const list = collections[modelName];
      const idx = list.findIndex(doc => matchesQuery(doc, query));
      if (idx === -1) return null;
      const removed = list.splice(idx, 1)[0];
      return new MockDoc(modelName, removed);
    }

    static async countDocuments(query = {}) {
      const list = collections[modelName].filter(doc => matchesQuery(doc, query));
      return list.length;
    }

    static async insertMany(docs) {
      const results = [];
      for (const d of docs) {
        const inst = new MockDoc(modelName, d);
        await inst.save();
        results.push(inst);
      }
      return results;
    }

    static async deleteMany(query = {}) {
      const originalLength = collections[modelName].length;
      collections[modelName] = collections[modelName].filter(doc => !matchesQuery(doc, query));
      return { deletedCount: originalLength - collections[modelName].length };
    }

    static async create(data) {
      if (Array.isArray(data)) {
        return MockModel.insertMany(data);
      }
      const inst = new MockDoc(modelName, data);
      return inst.save();
    }

    static async aggregate(pipeline = []) {
      let data = collections[modelName] || [];
      for (const stage of pipeline) {
        if (stage.$group) {
          const groupRule = stage.$group;
          const idKey = groupRule._id;
          const groups = {};
          for (const doc of data) {
            let keyVal = 'Unknown';
            if (typeof idKey === 'string' && idKey.startsWith('$')) {
              keyVal = doc[idKey.substring(1)] || null;
            }
            if (!groups[keyVal]) {
              groups[keyVal] = { _id: keyVal };
            }
            for (const field of Object.keys(groupRule)) {
              if (field === '_id') continue;
              const op = groupRule[field];
              if (op && op.$sum !== undefined) {
                const sumVal = typeof op.$sum === 'number' ? op.$sum : (doc[op.$sum.substring(1)] || 0);
                groups[keyVal][field] = (groups[keyVal][field] || 0) + sumVal;
              }
            }
          }
          data = Object.values(groups);
        }
      }
      return data;
    }
  }

  return MockModel;
}

// Override mongoose model helper
const mockModels = {};
const schemas = {};
function getMockModel(name, schema) {
  if (schema) {
    schemas[name] = schema;
  }
  if (!mockModels[name]) {
    mockModels[name] = createMockModel(name);
  }
  return mockModels[name];
}

module.exports = {
  collections,
  getMockModel,
  generateId
};
