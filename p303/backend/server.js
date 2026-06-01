const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ type: ['application/json', 'application/vnd.api+json'] }));

let posts = [
  { id: '1', title: 'Ember.js 入门指南', body: '这是一篇关于 Ember.js 的入门教程，涵盖基础概念和核心功能。', author: '张三', status: 'published', createdAt: '2024-01-15T10:00:00Z' },
  { id: '2', title: 'JSON:API 规范详解', body: '深入了解 JSON:API 规范，学习如何构建符合标准的 RESTful API。', author: '李四', status: 'published', createdAt: '2024-01-20T14:30:00Z' },
  { id: '3', title: 'Node.js 后端最佳实践', body: '分享 Node.js 后端开发中的最佳实践和常见问题解决方案。', author: '王五', status: 'draft', createdAt: '2024-02-01T09:15:00Z' },
  { id: '4', title: '前端数据管理策略', body: '探讨现代前端应用中的数据管理策略，包括 Ember Data 的使用。', author: '张三', status: 'published', createdAt: '2024-02-10T16:45:00Z' },
  { id: '5', title: '响应式设计模式', body: '学习如何构建响应式的 Web 应用，适配各种设备尺寸。', author: '赵六', status: 'published', createdAt: '2024-02-15T11:20:00Z' },
  { id: '6', title: 'JavaScript 性能优化', body: '深入了解 JavaScript 性能优化技巧，提升应用运行速度。', author: '李四', status: 'draft', createdAt: '2024-02-20T08:00:00Z' },
  { id: '7', title: '测试驱动开发实践', body: '介绍测试驱动开发（TDD）的理念和实际项目中的应用方法。', author: '王五', status: 'published', createdAt: '2024-03-01T13:30:00Z' },
  { id: '8', title: '微服务架构设计', body: '探讨微服务架构的设计原则和实施策略。', author: '张三', status: 'published', createdAt: '2024-03-05T15:00:00Z' },
  { id: '9', title: 'GraphQL vs REST', body: '对比 GraphQL 和 REST 两种 API 设计风格的优缺点。', author: '赵六', status: 'draft', createdAt: '2024-03-10T10:45:00Z' },
  { id: '10', title: 'Docker 容器化部署', body: '学习使用 Docker 进行应用容器化和部署的完整流程。', author: '李四', status: 'published', createdAt: '2024-03-15T09:00:00Z' }
];

let comments = [
  { id: '1', body: '非常棒的入门教程！', author: '读者A', postId: '1', createdAt: '2024-01-16T08:00:00Z' },
  { id: '2', body: '解释得很清楚，谢谢分享。', author: '读者B', postId: '1', createdAt: '2024-01-17T10:30:00Z' },
  { id: '3', body: 'JSON:API 确实让 API 设计更规范了。', author: '开发者C', postId: '2', createdAt: '2024-01-21T09:15:00Z' },
  { id: '4', body: '希望能有更多实际案例。', author: '读者D', postId: '2', createdAt: '2024-01-22T14:00:00Z' },
  { id: '5', body: '这些最佳实践很实用。', author: '工程师E', postId: '3', createdAt: '2024-02-02T11:00:00Z' },
  { id: '6', body: 'Ember Data 确实强大。', author: '前端F', postId: '4', createdAt: '2024-02-11T16:30:00Z' },
  { id: '7', body: '响应式设计太重要了。', author: '设计师G', postId: '5', createdAt: '2024-02-16T09:45:00Z' },
  { id: '8', body: '性能优化确实需要重视。', author: '架构师H', postId: '6', createdAt: '2024-02-21T10:00:00Z' },
  { id: '9', body: 'TDD 值得推广。', author: '测试I', postId: '7', createdAt: '2024-03-02T14:30:00Z' },
  { id: '10', body: '微服务架构确实复杂但灵活。', author: '运维J', postId: '8', createdAt: '2024-03-06T11:15:00Z' },
  { id: '11', body: '各有优劣，看场景选择。', author: '架构师K', postId: '9', createdAt: '2024-03-11T08:45:00Z' },
  { id: '12', body: 'Docker 确实简化了部署。', author: 'DevOpsL', postId: '10', createdAt: '2024-03-16T13:00:00Z' }
];

let nextPostId = 11;
let nextCommentId = 13;

const dataStore = {
  posts,
  comments
};

const attributeMap = {
  posts: {
    title: 'title',
    body: 'body',
    author: 'author',
    status: 'status',
    'created-at': 'createdAt'
  },
  comments: {
    body: 'body',
    author: 'author',
    'created-at': 'createdAt'
  }
};

const relationshipsMap = {
  posts: {
    comments: { type: 'comments', direction: 'hasMany', foreignKey: 'postId' }
  },
  comments: {
    post: { type: 'posts', direction: 'belongsTo', foreignKey: 'postId' }
  }
};

function findResourceById(type, id) {
  return dataStore[type]?.find(r => r.id === id);
}

function findRelatedResources(type, foreignKey, id) {
  return dataStore[type]?.filter(r => r[foreignKey] === id) || [];
}

function getFields(fieldsParam, type) {
  if (!fieldsParam || !fieldsParam[type]) return null;
  return fieldsParam[type].split(',').map(f => f.trim());
}

function filterAttributes(resource, type, fields) {
  const attrs = {};
  const map = attributeMap[type];
  
  for (const [jsonApiKey, modelKey] of Object.entries(map)) {
    if (!fields || fields.includes(jsonApiKey)) {
      attrs[jsonApiKey] = resource[modelKey];
    }
  }
  
  return attrs;
}

function filterRelationships(type, fields) {
  const rels = {};
  const map = relationshipsMap[type];
  
  for (const [relName, relConfig] of Object.entries(map)) {
    if (!fields || fields.includes(relName)) {
      rels[relName] = relConfig;
    }
  }
  
  return rels;
}

function parseInclude(includeParam) {
  if (!includeParam) return [];
  return includeParam.split(',').map(path => path.trim().split('.'));
}

function buildIncludedMap() {
  return new Map();
}

function addToIncluded(includedMap, resource, type, fields) {
  const key = `${type}-${resource.id}`;
  if (!includedMap.has(key)) {
    const data = serializeResource(resource, type, fields, [], includedMap, true);
    includedMap.set(key, data);
  }
}

function serializeResource(resource, type, fields, includePaths = [], includedMap = null, isIncluded = false) {
  includePaths = includePaths || [];
  const attributeFields = fields ? getFields(fields, type) : null;
  
  const attributes = filterAttributes(resource, type, attributeFields);
  const relationshipsConfig = filterRelationships(type, null);
  
  const data = {
    id: String(resource.id),
    type,
    attributes
  };

  const relationships = {};
  for (const [relName, relConfig] of Object.entries(relationshipsConfig)) {
    const relData = {
      links: {
        related: `/${type}/${resource.id}/${relName}`
      }
    };

    if (relConfig.direction === 'hasMany') {
      const relatedResources = findRelatedResources(relConfig.type, relConfig.foreignKey, resource.id);
      relData.data = relatedResources.map(r => ({ id: String(r.id), type: relConfig.type }));
      
      if (includePaths.some(p => p[0] === relName)) {
        const nestedIncludePaths = includePaths
          .filter(p => p[0] === relName && p.length > 1)
          .map(p => p.slice(1));
        
        if (includedMap) {
          const relFields = nestedIncludePaths.length > 0 ? fields : null;
          relatedResources.forEach(r => addToIncluded(includedMap, r, relConfig.type, relFields));
          
          if (nestedIncludePaths.length > 0) {
            relatedResources.forEach(r => {
              serializeResource(r, relConfig.type, fields, nestedIncludePaths, includedMap, true);
            });
          }
        }
      }
    } else if (relConfig.direction === 'belongsTo') {
      const relatedId = resource[relConfig.foreignKey];
      relData.data = { id: String(relatedId), type: relConfig.type };
      
      if (includePaths.some(p => p[0] === relName)) {
        const nestedIncludePaths = includePaths
          .filter(p => p[0] === relName && p.length > 1)
          .map(p => p.slice(1));
        
        if (includedMap) {
          const relatedResource = findResourceById(relConfig.type, relatedId);
          if (relatedResource) {
            const relFields = nestedIncludePaths.length > 0 ? fields : null;
            addToIncluded(includedMap, relatedResource, relConfig.type, relFields);
            
            if (nestedIncludePaths.length > 0) {
              serializeResource(relatedResource, relConfig.type, fields, nestedIncludePaths, includedMap, true);
            }
          }
        }
      }
    }

    relationships[relName] = relData;
  }

  if (Object.keys(relationships).length > 0) {
    data.relationships = relationships;
  }

  return data;
}

function serializePost(post, fields, includePaths, includedMap) {
  return serializeResource(post, 'posts', fields, includePaths, includedMap);
}

function serializeComment(comment, fields, includePaths, includedMap) {
  return serializeResource(comment, 'comments', fields, includePaths, includedMap);
}

function applyFilter(data, filter) {
  if (!filter) return data;

  return data.filter(item => {
    for (const key in filter) {
      if (key === 'id') {
        const ids = filter[key].split(',');
        if (!ids.includes(item.id)) return false;
      } else if (key.includes('.')) {
        const parts = key.split('.');
        const value = parts.reduce((obj, k) => obj ? obj[k] : undefined, item);
        if (value === undefined || String(value).toLowerCase() !== String(filter[key]).toLowerCase()) return false;
      } else {
        const itemValue = item[key] || item[key.replace(/-([a-z])/g, (g) => g[1].toUpperCase())];
        if (itemValue === undefined || String(itemValue).toLowerCase() !== String(filter[key]).toLowerCase()) return false;
      }
    }
    return true;
  });
}

function applySort(data, sort) {
  if (!sort) return data;

  const sortFields = sort.split(',').map(field => {
    const descending = field.startsWith('-');
    const fieldName = descending ? field.slice(1) : field;
    const camelField = fieldName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    return { field: camelField, descending };
  });

  return [...data].sort((a, b) => {
    for (const { field, descending } of sortFields) {
      const aVal = a[field];
      const bVal = b[field];
      
      if (aVal < bVal) return descending ? 1 : -1;
      if (aVal > bVal) return descending ? -1 : 1;
    }
    return 0;
  });
}

function applyPagination(data, page, baseUrl) {
  if (!page) {
    return {
      data,
      links: {
        self: baseUrl
      }
    };
  }

  const number = parseInt(page.number) || 1;
  const size = parseInt(page.size) || 10;
  const total = data.length;
  const totalPages = Math.ceil(total / size);
  const start = (number - 1) * size;
  const end = start + size;
  const paginatedData = data.slice(start, end);

  const buildUrl = (pageNum) => {
    const url = new URL(baseUrl, `http://localhost:${PORT}`);
    url.searchParams.set('page[number]', pageNum);
    url.searchParams.set('page[size]', size);
    return url.pathname + url.search;
  };

  const links = {
    self: buildUrl(number),
    first: buildUrl(1),
    last: buildUrl(totalPages)
  };

  if (number > 1) {
    links.prev = buildUrl(number - 1);
  }
  if (number < totalPages) {
    links.next = buildUrl(number + 1);
  }

  return {
    data: paginatedData,
    links,
    meta: {
      'total-pages': totalPages,
      'total-records': total,
      'current-page': number,
      'page-size': size
    }
  };
}

function buildResponse(serializedData, includedMap, links, meta) {
  const response = {
    data: serializedData,
    links,
    meta
  };

  if (includedMap && includedMap.size > 0) {
    response.included = Array.from(includedMap.values());
  }

  return response;
}

app.get('/posts', (req, res) => {
  let result = [...posts];
  
  result = applyFilter(result, req.query.filter);
  result = applySort(result, req.query.sort);
  
  const baseUrl = req.originalUrl;
  const { data: paginatedData, links, meta } = applyPagination(result, req.query.page, baseUrl);
  
  const includePaths = parseInclude(req.query.include);
  const includedMap = includePaths.length > 0 ? buildIncludedMap() : null;
  
  const serializedData = paginatedData.map(post => 
    serializePost(post, req.query.fields, includePaths, includedMap)
  );
  
  const response = buildResponse(serializedData, includedMap, links, meta);
  res.json(response);
});

app.get('/posts/:id', (req, res) => {
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Post not found' }]
    });
  }

  const includePaths = parseInclude(req.query.include);
  const includedMap = includePaths.length > 0 ? buildIncludedMap() : null;
  
  const data = serializePost(post, req.query.fields, includePaths, includedMap);
  const response = buildResponse(data, includedMap);
  res.json(response);
});

app.get('/posts/:id/comments', (req, res) => {
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Post not found' }]
    });
  }

  let postComments = comments.filter(c => c.postId === req.params.id);
  postComments = applyFilter(postComments, req.query.filter);
  postComments = applySort(postComments, req.query.sort);
  
  const baseUrl = req.originalUrl;
  const { data: paginatedData, links, meta } = applyPagination(postComments, req.query.page, baseUrl);
  
  const includePaths = parseInclude(req.query.include);
  const includedMap = includePaths.length > 0 ? buildIncludedMap() : null;
  
  const serializedData = paginatedData.map(comment => 
    serializeComment(comment, req.query.fields, includePaths, includedMap)
  );
  
  const response = buildResponse(serializedData, includedMap, links, meta);
  res.json(response);
});

app.post('/posts', (req, res) => {
  const { data } = req.body;
  if (!data || data.type !== 'posts') {
    return res.status(400).json({
      errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid data type' }]
    });
  }

  const attrs = data.attributes || {};
  const newPost = {
    id: String(nextPostId++),
    title: attrs.title || '',
    body: attrs.body || '',
    author: attrs.author || 'Anonymous',
    status: attrs.status || 'draft',
    createdAt: new Date().toISOString()
  };

  posts.push(newPost);
  
  const includePaths = parseInclude(req.query.include);
  const includedMap = includePaths.length > 0 ? buildIncludedMap() : null;
  
  const responseData = serializePost(newPost, req.query.fields, includePaths, includedMap);
  const response = buildResponse(responseData, includedMap);
  res.status(201).json(response);
});

app.patch('/posts/:id', (req, res) => {
  const postIndex = posts.findIndex(p => p.id === req.params.id);
  if (postIndex === -1) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Post not found' }]
    });
  }

  const { data } = req.body;
  if (!data || data.type !== 'posts' || data.id !== req.params.id) {
    return res.status(400).json({
      errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid data' }]
    });
  }

  const attrs = data.attributes || {};
  posts[postIndex] = {
    ...posts[postIndex],
    title: attrs.title !== undefined ? attrs.title : posts[postIndex].title,
    body: attrs.body !== undefined ? attrs.body : posts[postIndex].body,
    author: attrs.author !== undefined ? attrs.author : posts[postIndex].author,
    status: attrs.status !== undefined ? attrs.status : posts[postIndex].status
  };

  const includePaths = parseInclude(req.query.include);
  const includedMap = includePaths.length > 0 ? buildIncludedMap() : null;
  
  const responseData = serializePost(posts[postIndex], req.query.fields, includePaths, includedMap);
  const response = buildResponse(responseData, includedMap);
  res.json(response);
});

app.delete('/posts/:id', (req, res) => {
  const postIndex = posts.findIndex(p => p.id === req.params.id);
  if (postIndex === -1) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Post not found' }]
    });
  }

  posts.splice(postIndex, 1);
  comments = comments.filter(c => c.postId !== req.params.id);
  res.status(204).send();
});

app.get('/comments', (req, res) => {
  let result = [...comments];
  
  result = applyFilter(result, req.query.filter);
  result = applySort(result, req.query.sort);
  
  const baseUrl = req.originalUrl;
  const { data: paginatedData, links, meta } = applyPagination(result, req.query.page, baseUrl);
  
  const includePaths = parseInclude(req.query.include);
  const includedMap = includePaths.length > 0 ? buildIncludedMap() : null;
  
  const serializedData = paginatedData.map(comment => 
    serializeComment(comment, req.query.fields, includePaths, includedMap)
  );
  
  const response = buildResponse(serializedData, includedMap, links, meta);
  res.json(response);
});

app.get('/comments/:id', (req, res) => {
  const comment = comments.find(c => c.id === req.params.id);
  if (!comment) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Comment not found' }]
    });
  }

  const includePaths = parseInclude(req.query.include);
  const includedMap = includePaths.length > 0 ? buildIncludedMap() : null;
  
  const data = serializeComment(comment, req.query.fields, includePaths, includedMap);
  const response = buildResponse(data, includedMap);
  res.json(response);
});

app.post('/comments', (req, res) => {
  const { data } = req.body;
  if (!data || data.type !== 'comments') {
    return res.status(400).json({
      errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid data type' }]
    });
  }

  const attrs = data.attributes || {};
  const relationships = data.relationships || {};
  const postId = relationships.post?.data?.id;

  if (!postId || !posts.find(p => p.id === postId)) {
    return res.status(400).json({
      errors: [{ status: '400', title: 'Bad Request', detail: 'Valid postId is required' }]
    });
  }

  const newComment = {
    id: String(nextCommentId++),
    body: attrs.body || '',
    author: attrs.author || 'Anonymous',
    postId: postId,
    createdAt: new Date().toISOString()
  };

  comments.push(newComment);
  
  const includePaths = parseInclude(req.query.include);
  const includedMap = includePaths.length > 0 ? buildIncludedMap() : null;
  
  const responseData = serializeComment(newComment, req.query.fields, includePaths, includedMap);
  const response = buildResponse(responseData, includedMap);
  res.status(201).json(response);
});

app.patch('/comments/:id', (req, res) => {
  const commentIndex = comments.findIndex(c => c.id === req.params.id);
  if (commentIndex === -1) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Comment not found' }]
    });
  }

  const { data } = req.body;
  if (!data || data.type !== 'comments' || data.id !== req.params.id) {
    return res.status(400).json({
      errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid data' }]
    });
  }

  const attrs = data.attributes || {};
  comments[commentIndex] = {
    ...comments[commentIndex],
    body: attrs.body !== undefined ? attrs.body : comments[commentIndex].body,
    author: attrs.author !== undefined ? attrs.author : comments[commentIndex].author
  };

  const includePaths = parseInclude(req.query.include);
  const includedMap = includePaths.length > 0 ? buildIncludedMap() : null;
  
  const responseData = serializeComment(comments[commentIndex], req.query.fields, includePaths, includedMap);
  const response = buildResponse(responseData, includedMap);
  res.json(response);
});

app.delete('/comments/:id', (req, res) => {
  const commentIndex = comments.findIndex(c => c.id === req.params.id);
  if (commentIndex === -1) {
    return res.status(404).json({
      errors: [{ status: '404', title: 'Not Found', detail: 'Comment not found' }]
    });
  }

  comments.splice(commentIndex, 1);
  res.status(204).send();
});

function executeBatchOp(op) {
  const { method, type, id, data } = op;

  if (!type || !['posts', 'comments'].includes(type)) {
    return { status: 400, body: { errors: [{ status: '400', title: 'Bad Request', detail: `Invalid type: ${type}` }] } };
  }

  if (method === 'GET' && !id) {
    let result = [...dataStore[type]];
    if (op.filter) result = applyFilter(result, op.filter);
    if (op.sort) result = applySort(result, op.sort);
    const pag = applyPagination(result, op.page || null, `/${type}`);
    return { status: 200, body: { data: pag.data.map(r => serializeResource(r, type, null, [], null)), links: pag.links, meta: pag.meta } };
  }

  if (method === 'GET' && id) {
    const resource = findResourceById(type, id);
    if (!resource) return { status: 404, body: { errors: [{ status: '404', title: 'Not Found', detail: `${type} ${id} not found` }] } };
    return { status: 200, body: { data: serializeResource(resource, type, null, [], null) } };
  }

  if (method === 'POST') {
    if (!data || data.type !== type) {
      return { status: 400, body: { errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid data type' }] } };
    }
    const attrs = data.attributes || {};
    const now = new Date().toISOString();

    if (type === 'posts') {
      const newPost = { id: String(nextPostId++), title: attrs.title || '', body: attrs.body || '', author: attrs.author || 'Anonymous', status: attrs.status || 'draft', createdAt: now };
      posts.push(newPost);
      return { status: 201, body: { data: serializeResource(newPost, type, null, [], null) } };
    }

    if (type === 'comments') {
      const rels = data.relationships || {};
      const postId = rels.post?.data?.id;
      if (!postId || !posts.find(p => p.id === postId)) {
        return { status: 400, body: { errors: [{ status: '400', title: 'Bad Request', detail: 'Valid postId is required' }] } };
      }
      const newComment = { id: String(nextCommentId++), body: attrs.body || '', author: attrs.author || 'Anonymous', postId, createdAt: now };
      comments.push(newComment);
      return { status: 201, body: { data: serializeResource(newComment, type, null, [], null) } };
    }
  }

  if (method === 'PATCH') {
    if (!id) return { status: 400, body: { errors: [{ status: '400', title: 'Bad Request', detail: 'id is required for PATCH' }] } };
    if (!data || data.type !== type || data.id !== id) {
      return { status: 400, body: { errors: [{ status: '400', title: 'Bad Request', detail: 'Invalid data' }] } };
    }
    const arr = dataStore[type];
    const idx = arr.findIndex(r => r.id === id);
    if (idx === -1) return { status: 404, body: { errors: [{ status: '404', title: 'Not Found', detail: `${type} ${id} not found` }] } };
    const attrs = data.attributes || {};

    if (type === 'posts') {
      arr[idx] = { ...arr[idx], title: attrs.title !== undefined ? attrs.title : arr[idx].title, body: attrs.body !== undefined ? attrs.body : arr[idx].body, author: attrs.author !== undefined ? attrs.author : arr[idx].author, status: attrs.status !== undefined ? attrs.status : arr[idx].status };
      return { status: 200, body: { data: serializeResource(arr[idx], type, null, [], null) } };
    }

    if (type === 'comments') {
      arr[idx] = { ...arr[idx], body: attrs.body !== undefined ? attrs.body : arr[idx].body, author: attrs.author !== undefined ? attrs.author : arr[idx].author };
      return { status: 200, body: { data: serializeResource(arr[idx], type, null, [], null) } };
    }
  }

  if (method === 'DELETE') {
    if (!id) return { status: 400, body: { errors: [{ status: '400', title: 'Bad Request', detail: 'id is required for DELETE' }] } };
    const arr = dataStore[type];
    const idx = arr.findIndex(r => r.id === id);
    if (idx === -1) return { status: 404, body: { errors: [{ status: '404', title: 'Not Found', detail: `${type} ${id} not found` }] } };
    arr.splice(idx, 1);
    if (type === 'posts') comments = comments.filter(c => c.postId !== id);
    return { status: 204, body: null };
  }

  return { status: 400, body: { errors: [{ status: '400', title: 'Bad Request', detail: `Unsupported method: ${method}` }] } };
}

app.post('/batch', (req, res) => {
  const { operations } = req.body;

  if (!Array.isArray(operations) || operations.length === 0) {
    return res.status(400).json({
      errors: [{ status: '400', title: 'Bad Request', detail: 'operations array is required and must not be empty' }]
    });
  }

  if (operations.length > 50) {
    return res.status(400).json({
      errors: [{ status: '400', title: 'Bad Request', detail: 'Maximum 50 operations per batch request' }]
    });
  }

  const results = [];
  const sequential = req.body.sequential !== false;

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const result = executeBatchOp(op);
    results.push({
      op: i,
      status: result.status,
      body: result.body
    });

    if (sequential && result.status >= 400) {
      break;
    }
  }

  const hasError = results.some(r => r.status >= 400);
  res.status(hasError ? 207 : 200).json({
    meta: {
      'total-operations': operations.length,
      'completed-operations': results.length,
      'has-errors': hasError
    },
    results
  });
});

function generateOpenApiDoc() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'JSON:API Server',
      version: '1.0.0',
      description: 'A JSON:API compliant server for Ember.js applications, supporting filtering, sorting, pagination, sparse fieldsets, and include of related resources.',
      contact: { name: 'API Support', url: 'http://localhost:3000' },
      license: { name: 'MIT' }
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development server' }
    ],
    tags: [
      { name: 'Posts', description: 'Post resource operations' },
      { name: 'Comments', description: 'Comment resource operations' },
      { name: 'Batch', description: 'Batch operations' },
      { name: 'Documentation', description: 'API documentation' }
    ],
    paths: {
      '/posts': {
        get: {
          tags: ['Posts'],
          summary: 'List posts',
          description: 'Retrieve a paginated list of posts with optional filtering, sorting, sparse fieldsets, and included resources.',
          parameters: [
            { $ref: '#/components/parameters/filterParam' },
            { $ref: '#/components/parameters/sortParam' },
            { $ref: '#/components/parameters/pageNumberParam' },
            { $ref: '#/components/parameters/pageSizeParam' },
            { $ref: '#/components/parameters/includeParam' },
            { $ref: '#/components/parameters/fieldsPostsParam' },
            { $ref: '#/components/parameters/fieldsCommentsParam' }
          ],
          responses: {
            200: { $ref: '#/components/responses/PostsCollection' }
          }
        },
        post: {
          tags: ['Posts'],
          summary: 'Create a post',
          description: 'Create a new post resource.',
          requestBody: {
            required: true,
            content: {
              'application/vnd.api+json': {
                schema: { $ref: '#/components/schemas/PostCreateRequest' }
              }
            }
          },
          responses: {
            201: { $ref: '#/components/responses/PostSingle' },
            400: { $ref: '#/components/responses/BadRequest' }
          }
        }
      },
      '/posts/{id}': {
        get: {
          tags: ['Posts'],
          summary: 'Get a post',
          description: 'Retrieve a single post by ID.',
          parameters: [
            { $ref: '#/components/parameters/postIdParam' },
            { $ref: '#/components/parameters/includeParam' },
            { $ref: '#/components/parameters/fieldsPostsParam' },
            { $ref: '#/components/parameters/fieldsCommentsParam' }
          ],
          responses: {
            200: { $ref: '#/components/responses/PostSingle' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        patch: {
          tags: ['Posts'],
          summary: 'Update a post',
          description: 'Partially update a post resource.',
          parameters: [{ $ref: '#/components/parameters/postIdParam' }],
          requestBody: {
            required: true,
            content: {
              'application/vnd.api+json': {
                schema: { $ref: '#/components/schemas/PostUpdateRequest' }
              }
            }
          },
          responses: {
            200: { $ref: '#/components/responses/PostSingle' },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        delete: {
          tags: ['Posts'],
          summary: 'Delete a post',
          description: 'Delete a post and all its associated comments.',
          parameters: [{ $ref: '#/components/parameters/postIdParam' }],
          responses: {
            204: { description: 'No content - successful deletion' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/posts/{id}/comments': {
        get: {
          tags: ['Posts', 'Comments'],
          summary: 'List comments for a post',
          description: 'Retrieve paginated comments belonging to a specific post.',
          parameters: [
            { $ref: '#/components/parameters/postIdParam' },
            { $ref: '#/components/parameters/filterParam' },
            { $ref: '#/components/parameters/sortParam' },
            { $ref: '#/components/parameters/pageNumberParam' },
            { $ref: '#/components/parameters/pageSizeParam' },
            { $ref: '#/components/parameters/fieldsCommentsParam' }
          ],
          responses: {
            200: { $ref: '#/components/responses/CommentsCollection' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/comments': {
        get: {
          tags: ['Comments'],
          summary: 'List comments',
          description: 'Retrieve a paginated list of comments with optional filtering, sorting, and sparse fieldsets.',
          parameters: [
            { $ref: '#/components/parameters/filterParam' },
            { $ref: '#/components/parameters/sortParam' },
            { $ref: '#/components/parameters/pageNumberParam' },
            { $ref: '#/components/parameters/pageSizeParam' },
            { $ref: '#/components/parameters/includeParam' },
            { $ref: '#/components/parameters/fieldsCommentsParam' },
            { $ref: '#/components/parameters/fieldsPostsParam' }
          ],
          responses: {
            200: { $ref: '#/components/responses/CommentsCollection' }
          }
        },
        post: {
          tags: ['Comments'],
          summary: 'Create a comment',
          description: 'Create a new comment associated with a post.',
          requestBody: {
            required: true,
            content: {
              'application/vnd.api+json': {
                schema: { $ref: '#/components/schemas/CommentCreateRequest' }
              }
            }
          },
          responses: {
            201: { $ref: '#/components/responses/CommentSingle' },
            400: { $ref: '#/components/responses/BadRequest' }
          }
        }
      },
      '/comments/{id}': {
        get: {
          tags: ['Comments'],
          summary: 'Get a comment',
          description: 'Retrieve a single comment by ID.',
          parameters: [
            { $ref: '#/components/parameters/commentIdParam' },
            { $ref: '#/components/parameters/includeParam' },
            { $ref: '#/components/parameters/fieldsCommentsParam' },
            { $ref: '#/components/parameters/fieldsPostsParam' }
          ],
          responses: {
            200: { $ref: '#/components/responses/CommentSingle' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        patch: {
          tags: ['Comments'],
          summary: 'Update a comment',
          description: 'Partially update a comment resource.',
          parameters: [{ $ref: '#/components/parameters/commentIdParam' }],
          requestBody: {
            required: true,
            content: {
              'application/vnd.api+json': {
                schema: { $ref: '#/components/schemas/CommentUpdateRequest' }
              }
            }
          },
          responses: {
            200: { $ref: '#/components/responses/CommentSingle' },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        },
        delete: {
          tags: ['Comments'],
          summary: 'Delete a comment',
          description: 'Delete a comment resource.',
          parameters: [{ $ref: '#/components/parameters/commentIdParam' }],
          responses: {
            204: { description: 'No content - successful deletion' },
            404: { $ref: '#/components/responses/NotFound' }
          }
        }
      },
      '/batch': {
        post: {
          tags: ['Batch'],
          summary: 'Batch operations',
          description: 'Execute multiple operations in a single request. Supports GET, POST, PATCH, and DELETE for posts and comments. Set `sequential: false` to continue processing after errors. Maximum 50 operations per request.',
          requestBody: {
            required: true,
            content: {
              'application/vnd.api+json': {
                schema: { $ref: '#/components/schemas/BatchRequest' }
              }
            }
          },
          responses: {
            200: {
              description: 'All operations succeeded',
              content: {
                'application/vnd.api+json': {
                  schema: { $ref: '#/components/schemas/BatchResponse' }
                }
              }
            },
            207: {
              description: 'Some operations failed (multi-status)',
              content: {
                'application/vnd.api+json': {
                  schema: { $ref: '#/components/schemas/BatchResponse' }
                }
              }
            },
            400: { $ref: '#/components/responses/BadRequest' }
          }
        }
      },
      '/openapi.json': {
        get: {
          tags: ['Documentation'],
          summary: 'OpenAPI specification',
          description: 'Retrieve the OpenAPI 3.1.0 specification for this API.',
          responses: {
            200: {
              description: 'OpenAPI specification',
              content: {
                'application/json': {
                  schema: { type: 'object', description: 'OpenAPI 3.1.0 specification document' }
                }
              }
            }
          }
        }
      }
    },
    components: {
      parameters: {
        postIdParam: { name: 'id', in: 'path', required: true, description: 'Post ID', schema: { type: 'string' } },
        commentIdParam: { name: 'id', in: 'path', required: true, description: 'Comment ID', schema: { type: 'string' } },
        filterParam: { name: 'filter', in: 'query', required: false, description: 'Filter by attribute values (e.g. filter[author]=张三)', schema: { type: 'object' }, style: 'deepObject' },
        sortParam: { name: 'sort', in: 'query', required: false, description: 'Sort fields (prefix with - for descending, e.g. -createdAt)', schema: { type: 'string', example: '-createdAt' } },
        pageNumberParam: { name: 'page[number]', in: 'query', required: false, description: 'Page number', schema: { type: 'integer', minimum: 1, default: 1 } },
        pageSizeParam: { name: 'page[size]', in: 'query', required: false, description: 'Page size', schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 } },
        includeParam: { name: 'include', in: 'query', required: false, description: 'Comma-separated list of relationship paths to include (e.g. comments,comments.post)', schema: { type: 'string', example: 'comments' } },
        fieldsPostsParam: { name: 'fields[posts]', in: 'query', required: false, description: 'Sparse fieldset for posts (comma-separated list of attribute names)', schema: { type: 'string', example: 'title,author' } },
        fieldsCommentsParam: { name: 'fields[comments]', in: 'query', required: false, description: 'Sparse fieldset for comments (comma-separated list of attribute names)', schema: { type: 'string', example: 'body,author' } }
      },
      schemas: {
        PostAttributes: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Post title', example: 'Ember.js 入门指南' },
            body: { type: 'string', description: 'Post content', example: '这是一篇关于 Ember.js 的入门教程' },
            author: { type: 'string', description: 'Post author', example: '张三' },
            status: { type: 'string', description: 'Publication status', enum: ['published', 'draft'], example: 'published' },
            'created-at': { type: 'string', format: 'date-time', description: 'Creation timestamp', example: '2024-01-15T10:00:00Z' }
          }
        },
        CommentAttributes: {
          type: 'object',
          properties: {
            body: { type: 'string', description: 'Comment content', example: '非常棒的入门教程！' },
            author: { type: 'string', description: 'Comment author', example: '读者A' },
            'created-at': { type: 'string', format: 'date-time', description: 'Creation timestamp', example: '2024-01-16T08:00:00Z' }
          }
        },
        PostRelationships: {
          type: 'object',
          properties: {
            comments: {
              type: 'object',
              properties: {
                links: { type: 'object', properties: { related: { type: 'string', example: '/posts/1/comments' } } },
                data: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string', enum: ['comments'] } } } }
              }
            }
          }
        },
        CommentRelationships: {
          type: 'object',
          properties: {
            post: {
              type: 'object',
              properties: {
                links: { type: 'object', properties: { related: { type: 'string', example: '/posts/1' } } },
                data: { type: 'object', properties: { id: { type: 'string' }, type: { type: 'string', enum: ['posts'] } } }
              }
            }
          }
        },
        PostResource: {
          type: 'object',
          required: ['id', 'type', 'attributes'],
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['posts'] },
            attributes: { $ref: '#/components/schemas/PostAttributes' },
            relationships: { $ref: '#/components/schemas/PostRelationships' }
          }
        },
        CommentResource: {
          type: 'object',
          required: ['id', 'type', 'attributes'],
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['comments'] },
            attributes: { $ref: '#/components/schemas/CommentAttributes' },
            relationships: { $ref: '#/components/schemas/CommentRelationships' }
          }
        },
        PostCreateRequest: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['type'],
              properties: {
                type: { type: 'string', enum: ['posts'] },
                attributes: {
                  type: 'object',
                  required: ['title', 'body', 'author'],
                  properties: {
                    title: { type: 'string' },
                    body: { type: 'string' },
                    author: { type: 'string' },
                    status: { type: 'string', enum: ['published', 'draft'], default: 'draft' }
                  }
                }
              }
            }
          }
        },
        PostUpdateRequest: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['type', 'id'],
              properties: {
                type: { type: 'string', enum: ['posts'] },
                id: { type: 'string' },
                attributes: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    body: { type: 'string' },
                    author: { type: 'string' },
                    status: { type: 'string', enum: ['published', 'draft'] }
                  }
                }
              }
            }
          }
        },
        CommentCreateRequest: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['type'],
              properties: {
                type: { type: 'string', enum: ['comments'] },
                attributes: {
                  type: 'object',
                  required: ['body'],
                  properties: {
                    body: { type: 'string' },
                    author: { type: 'string' }
                  }
                },
                relationships: {
                  type: 'object',
                  required: ['post'],
                  properties: {
                    post: {
                      type: 'object',
                      required: ['data'],
                      properties: {
                        data: {
                          type: 'object',
                          required: ['type', 'id'],
                          properties: { type: { type: 'string', enum: ['posts'] }, id: { type: 'string' } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        CommentUpdateRequest: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['type', 'id'],
              properties: {
                type: { type: 'string', enum: ['comments'] },
                id: { type: 'string' },
                attributes: {
                  type: 'object',
                  properties: {
                    body: { type: 'string' },
                    author: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        BatchOperation: {
          type: 'object',
          required: ['method', 'type'],
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'DELETE'], description: 'HTTP method' },
            type: { type: 'string', enum: ['posts', 'comments'], description: 'Resource type' },
            id: { type: 'string', description: 'Resource ID (required for GET single, PATCH, DELETE)' },
            data: { type: 'object', description: 'Resource data for POST/PATCH (JSON:API format)' },
            filter: { type: 'object', description: 'Filter parameters for GET collection' },
            sort: { type: 'string', description: 'Sort parameter for GET collection' },
            page: { type: 'object', description: 'Pagination parameters for GET collection', properties: { number: { type: 'integer' }, size: { type: 'integer' } } }
          }
        },
        BatchRequest: {
          type: 'object',
          required: ['operations'],
          properties: {
            sequential: { type: 'boolean', default: true, description: 'If true, stop on first error' },
            operations: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: { $ref: '#/components/schemas/BatchOperation' }
            }
          }
        },
        BatchResult: {
          type: 'object',
          properties: {
            op: { type: 'integer', description: 'Operation index' },
            status: { type: 'integer', description: 'HTTP status code' },
            body: { description: 'Response body (null for 204)', oneOf: [{ type: 'object' }, { type: 'null' }] }
          }
        },
        BatchResponse: {
          type: 'object',
          properties: {
            meta: {
              type: 'object',
              properties: {
                'total-operations': { type: 'integer' },
                'completed-operations': { type: 'integer' },
                'has-errors': { type: 'boolean' }
              }
            },
            results: {
              type: 'array',
              items: { $ref: '#/components/schemas/BatchResult' }
            }
          }
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            'total-pages': { type: 'integer' },
            'total-records': { type: 'integer' },
            'current-page': { type: 'integer' },
            'page-size': { type: 'integer' }
          }
        },
        PaginationLinks: {
          type: 'object',
          properties: {
            self: { type: 'string' },
            first: { type: 'string' },
            last: { type: 'string' },
            prev: { type: 'string' },
            next: { type: 'string' }
          }
        },
        ErrorObject: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            title: { type: 'string' },
            detail: { type: 'string' }
          }
        }
      },
      responses: {
        PostsCollection: {
          description: 'A collection of post resources',
          content: {
            'application/vnd.api+json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: '#/components/schemas/PostResource' } },
                  included: { type: 'array', items: { $ref: '#/components/schemas/CommentResource' }, description: 'Included resources when include parameter is used' },
                  links: { $ref: '#/components/schemas/PaginationLinks' },
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
                }
              }
            }
          }
        },
        CommentsCollection: {
          description: 'A collection of comment resources',
          content: {
            'application/vnd.api+json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: '#/components/schemas/CommentResource' } },
                  included: { type: 'array', items: { $ref: '#/components/schemas/PostResource' }, description: 'Included resources when include parameter is used' },
                  links: { $ref: '#/components/schemas/PaginationLinks' },
                  meta: { $ref: '#/components/schemas/PaginationMeta' }
                }
              }
            }
          }
        },
        PostSingle: {
          description: 'A single post resource',
          content: {
            'application/vnd.api+json': {
              schema: {
                type: 'object',
                properties: {
                  data: { $ref: '#/components/schemas/PostResource' },
                  included: { type: 'array', items: { $ref: '#/components/schemas/CommentResource' }, description: 'Included resources when include parameter is used' }
                }
              }
            }
          }
        },
        CommentSingle: {
          description: 'A single comment resource',
          content: {
            'application/vnd.api+json': {
              schema: {
                type: 'object',
                properties: {
                  data: { $ref: '#/components/schemas/CommentResource' },
                  included: { type: 'array', items: { $ref: '#/components/schemas/PostResource' }, description: 'Included resources when include parameter is used' }
                }
              }
            }
          }
        },
        BadRequest: {
          description: 'Bad request',
          content: {
            'application/vnd.api+json': {
              schema: {
                type: 'object',
                properties: {
                  errors: { type: 'array', items: { $ref: '#/components/schemas/ErrorObject' } }
                }
              }
            }
          }
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/vnd.api+json': {
              schema: {
                type: 'object',
                properties: {
                  errors: { type: 'array', items: { $ref: '#/components/schemas/ErrorObject' } }
                }
              }
            }
          }
        }
      }
    }
  };
}

app.get('/openapi.json', (req, res) => {
  res.json(generateOpenApiDoc());
});

app.listen(PORT, () => {
  console.log(`JSON:API Server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET    /posts');
  console.log('  GET    /posts/:id');
  console.log('  GET    /posts/:id/comments');
  console.log('  POST   /posts');
  console.log('  PATCH  /posts/:id');
  console.log('  DELETE /posts/:id');
  console.log('  GET    /comments');
  console.log('  GET    /comments/:id');
  console.log('  POST   /comments');
  console.log('  PATCH  /comments/:id');
  console.log('  DELETE /comments/:id');
  console.log('  POST   /batch');
  console.log('  GET    /openapi.json');
  console.log('');
  console.log('Supported query parameters:');
  console.log('  - filter[field]=value    : Filter results');
  console.log('  - sort=field             : Sort results (prefix with - for descending)');
  console.log('  - page[number]=N         : Page number');
  console.log('  - page[size]=N           : Page size');
  console.log('  - include=rel1,rel2      : Include related resources');
  console.log('  - fields[type]=f1,f2     : Sparse fieldset');
});
