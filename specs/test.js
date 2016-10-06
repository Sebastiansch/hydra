'use strict';

require('./helpers/chai.js');
require('sinon');

const config = require('./properties').value;
const version = require('../package.json').version;
const redis = require('redis');
const invalidConfig = {};
const validConfig = {
  'serviceName': 'test-service',
  'serviceDescription': 'Raison d\'etre',
  'serviceIP': '127.0.0.1',
  'servicePort': 5000,
  'serviceType': 'test',
  'redis': {
    'url': '127.0.0.1',
    'port': 6379,
    'db': 0
  }
};

/**
* Change into specs folder so that config loading can find file using relative path.
*/
process.chdir('./specs');

function cleanupRedisEntries(done) {
  let redisClient = redis.createClient(validConfig.redis.port, validConfig.redis.url);
  redisClient.multi()
    .del('hydra:service:test-service:service')
    .hdel('hydra:service:nodes', '73909f8c96a9d08e876411c0a212a1f4')
    .exec(done);
  redisClient.quit();
}

describe('Hydra', () => {
  describe('Initialization', () => {
    it('should succeed when provided with a configuration object', (done) => {
      const hydra = require('../index.js');
      hydra.init(validConfig)
        .then(() => {
          expect(hydra.getServiceName()).to.equal(validConfig.serviceName);
          expect(hydra.getInstanceID()).to.equal('73909f8c96a9d08e876411c0a212a1f4');
          hydra.shutdown();
          done();
        });
    });
    it('should fail if not provided with a configuration object', (done) => {
      const hydra = require('../index.js');
      hydra.init(invalidConfig)
        .then(() => {
          expect(hydra.getServiceName()).to.be.undefined;
          hydra.shutdown();
          done();
        });
    });
  });

  describe('Service', () => {
    beforeEach(function(done) {
      cleanupRedisEntries(done);
    });

    after(function(done) {
      cleanupRedisEntries(done);
    });

    it('should not be discoverable if not registered', (done) => {
      const hydra = require('../index.js');
      hydra.init(validConfig)
        .then(() => {
          hydra.findService(validConfig.serviceName)
            .then((info) => {
              expect(false).to.be.true;
              hydra.shutdown();
              done();
            })
            .catch((err) => {
              expect(err.message).to.be.equal('Can\'t find test-service service');
              hydra.shutdown();
              done();
            });
        });
    });
    it('should discover a service which has been registered', (done) => {
      const hydra = require('../index.js');
      hydra.init(validConfig)
        .then(() => {
          hydra.registerService()
            .then((serviceInfo) => {
              expect(serviceInfo.serviceName).to.equal(validConfig.serviceName);
              expect(serviceInfo.serviceIP).to.equal(validConfig.serviceIP);
              expect(serviceInfo.servicePort).to.equal(validConfig.servicePort);
              hydra.findService(validConfig.serviceName)
                .then((info) => {
                  expect(info.type).to.equal(validConfig.serviceType);
                  hydra.shutdown();
                  done();
                })
                .catch((err) => {
                  expect(false).to.be.true;
                  done();
                });
            });
        });
    });
    it('should be able to retrieve a list of services', (done) => {
      const hydra = require('../index.js');
      hydra.init(validConfig)
        .then(() => {
          hydra.registerService()
            .then(() => {
              hydra.getServices()
                .then((services) => {
                  expect(services.length).to.be.above(0);
                  expect(services[0].serviceName).to.equal(validConfig.serviceName);
                  hydra.shutdown();
                  done();
                });
            });
        });
    });
    it('should be able to detect the presence of a registered services', (done) => {
      const hydra = require('../index.js');
      hydra.init(validConfig)
        .then(() => {
          hydra.registerService()
            .then(() => {
              hydra.getServicePresence(validConfig.serviceName)
                .then((presence) => {
                  expect(presence[0]).to.have.property('instanceID');
                  expect(presence[0]).to.have.property('updatedOn');
                  expect(presence[0]).to.have.property('processID');
                  expect(presence[0].processID).to.be.above(0);
                  hydra.shutdown();
                  done();
                });
            });
        });
    });
  });

  describe('Messaging', () => {
    it('should be able to create a valid message', function() {
      const hydra = require('../index.js');
      let msg = hydra.createUMFMessage({});
      expect(msg).to.have.property('mid');
      expect(msg).to.have.property('timestamp');
      expect(msg).to.have.property('version');
      hydra.shutdown();
    });
    it('should be able to send message to a service', function(done) {
      const hydra = require('../index.js');
      hydra.init(validConfig)
        .then(() => {
          hydra.registerService()
            .then(() => {
              let msg = hydra.createUMFMessage({
                to: `${validConfig.serviceName}:/`,
                from: 'chai-test:/',
                body: {
                  title: 'Microservices FTW!'
                }
              });
              return hydra.sendMessage(msg)
                .catch((err) => {
                  console.log('err', err);
                });
            })
            .catch((err) => {
              console.log('err', err);
            });
        });
        hydra.on('message', (message) => {
          expect(message).to.have.property('mid');
          expect(message).to.have.property('timestamp');
          expect(message).to.have.property('version');
          expect(message.body.title).to.equal('Microservices FTW!');
          hydra.shutdown();
          done();
        });
    });
    it('should be able to send message to a specific service', function(done) {
      const hydra = require('../index.js');
      hydra.init(validConfig)
        .then(() => {
          hydra.registerService()
            .then(() => {
              hydra.getServicePresence(validConfig.serviceName)
                .then((presence) => {
                  let serviceInstance = presence[0];
                  let msg = hydra.createUMFMessage({
                    to: `${serviceInstance.instanceID}@${validConfig.serviceName}:/`,
                    from: 'chai-test:/',
                    body: {
                      title: 'Microservices FTW!'
                    }
                  });
                  hydra.sendMessage(msg)
                    .then()
                    .catch((err) => {
                      console.log('err', err);
                    });
                  hydra.on('message', (message) => {
                    expect(message.body.title).to.equal('Microservices FTW!');
                    hydra.shutdown();
                    done();
                  });
                });
            });
        });
    });
  });

});
