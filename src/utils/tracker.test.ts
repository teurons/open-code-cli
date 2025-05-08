import fs from 'fs'
import path from 'path'
import { 
  trackerExists, 
  readTrackerConfig, 
  writeTrackerConfig, 
  updateRepoSyncData, 
  getLastSyncedCommit, 
  needsSync 
} from './tracker'

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn()
}))

// Mock path module
jest.mock('path', () => ({
  join: jest.fn((dir, file) => `${dir}/${file}`)
}))

describe('Tracker Utils', () => {
  const mockDir = '/test/dir'
  const mockRepo = 'owner/repo'
  const mockBranch = 'main'
  const mockCommitHash = 'abc123'
  
  beforeEach(() => {
    jest.clearAllMocks()
  })
  
  describe('trackerExists', () => {
    it('should check if tracker file exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true)
      
      const result = trackerExists(mockDir)
      
      expect(fs.existsSync).toHaveBeenCalledWith(`${mockDir}/open-code-cli.tracker.json`)
      expect(result).toBe(true)
    })
  })
  
  describe('readTrackerConfig', () => {
    it('should return empty config if file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false)
      
      const result = readTrackerConfig(mockDir)
      
      expect(result).toEqual({ repos: {} })
    })
    
    it('should read and parse tracker config', () => {
      const mockConfig = { repos: { 'owner/repo': { repo: 'owner/repo', branch: 'main', lastCommitHash: 'abc123', lastSyncedAt: '2023-01-01' } } }
      
      (fs.existsSync as jest.Mock).mockReturnValue(true)
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig))
      
      const result = readTrackerConfig(mockDir)
      
      expect(fs.readFileSync).toHaveBeenCalledWith(`${mockDir}/open-code-cli.tracker.json`, 'utf-8')
      expect(result).toEqual(mockConfig)
    })
    
    it('should return empty config on error', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true)
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Read error')
      })
      
      const result = readTrackerConfig(mockDir)
      
      expect(result).toEqual({ repos: {} })
    })
  })
  
  describe('writeTrackerConfig', () => {
    it('should write tracker config to file', () => {
      const mockConfig = { repos: { 'owner/repo': { repo: 'owner/repo', branch: 'main', lastCommitHash: 'abc123', lastSyncedAt: '2023-01-01' } } }
      
      writeTrackerConfig(mockDir, mockConfig)
      
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `${mockDir}/open-code-cli.tracker.json`, 
        JSON.stringify(mockConfig, null, 2)
      )
    })
    
    it('should throw error if write fails', () => {
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Write error')
      })
      
      expect(() => writeTrackerConfig(mockDir, { repos: {} })).toThrow()
    })
  })
  
  describe('updateRepoSyncData', () => {
    it('should update sync data for a repository', () => {
      const mockConfig = { repos: {} }
      
      // Mock readTrackerConfig to return empty config
      jest.spyOn(require('./tracker'), 'readTrackerConfig').mockReturnValue(mockConfig)
      
      // Mock Date.toISOString
      const mockDate = new Date('2023-01-01')
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any)
      
      updateRepoSyncData(mockDir, mockRepo, mockBranch, mockCommitHash)
      
      expect(mockConfig.repos[mockRepo]).toEqual({
        repo: mockRepo,
        branch: mockBranch,
        lastCommitHash: mockCommitHash,
        lastSyncedAt: mockDate.toISOString()
      })
    })
  })
  
  describe('getLastSyncedCommit', () => {
    it('should return null if repo not found', () => {
      jest.spyOn(require('./tracker'), 'readTrackerConfig').mockReturnValue({ repos: {} })
      
      const result = getLastSyncedCommit(mockDir, mockRepo, mockBranch)
      
      expect(result).toBeNull()
    })
    
    it('should return null if branch does not match', () => {
      jest.spyOn(require('./tracker'), 'readTrackerConfig').mockReturnValue({ 
        repos: { 
          [mockRepo]: { 
            repo: mockRepo, 
            branch: 'other-branch', 
            lastCommitHash: mockCommitHash, 
            lastSyncedAt: '2023-01-01' 
          } 
        } 
      })
      
      const result = getLastSyncedCommit(mockDir, mockRepo, mockBranch)
      
      expect(result).toBeNull()
    })
    
    it('should return commit hash if repo and branch match', () => {
      jest.spyOn(require('./tracker'), 'readTrackerConfig').mockReturnValue({ 
        repos: { 
          [mockRepo]: { 
            repo: mockRepo, 
            branch: mockBranch, 
            lastCommitHash: mockCommitHash, 
            lastSyncedAt: '2023-01-01' 
          } 
        } 
      })
      
      const result = getLastSyncedCommit(mockDir, mockRepo, mockBranch)
      
      expect(result).toBe(mockCommitHash)
    })
  })
  
  describe('needsSync', () => {
    it('should return true if repo never synced', () => {
      jest.spyOn(require('./tracker'), 'getLastSyncedCommit').mockReturnValue(null)
      
      const result = needsSync(mockDir, mockRepo, mockBranch, mockCommitHash)
      
      expect(result).toBe(true)
    })
    
    it('should return true if commit hash is different', () => {
      jest.spyOn(require('./tracker'), 'getLastSyncedCommit').mockReturnValue('different-hash')
      
      const result = needsSync(mockDir, mockRepo, mockBranch, mockCommitHash)
      
      expect(result).toBe(true)
    })
    
    it('should return false if commit hash is the same', () => {
      jest.spyOn(require('./tracker'), 'getLastSyncedCommit').mockReturnValue(mockCommitHash)
      
      const result = needsSync(mockDir, mockRepo, mockBranch, mockCommitHash)
      
      expect(result).toBe(false)
    })
  })
})
