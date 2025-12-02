'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import Navigation from '@/components/Navigation'
import Footer from '@/components/Footer'
import { Sparkles, DollarSign, TrendingUp, Users, Share2, Wallet, CheckCircle, Twitter, MessageCircle } from 'lucide-react'

export default function PartnerPage() {
  const router = useRouter()
  const [walletConnected, setWalletConnected] = useState(false)
  const [postContent, setPostContent] = useState('')
  const [postLink, setPostLink] = useState('')

  // Check for connected wallets on mount
  useEffect(() => {
    const checkWallet = () => {
      try {
        const web3Wallets = JSON.parse(localStorage.getItem('web3Wallets') || '[]')
        const qrdxWallets = JSON.parse(localStorage.getItem('qrdxWallets') || '[]')
        setWalletConnected(web3Wallets.length > 0 || qrdxWallets.length > 0)
      } catch {
        setWalletConnected(false)
      }
    }
    
    checkWallet()
    window.addEventListener('storage', checkWallet)
    return () => window.removeEventListener('storage', checkWallet)
  }, [])

  // Stub data - would come from QRDX Chain API
  const userStats = {
    totalEarned: 1234.56,
    postsShared: 24,
    engagement: 15234,
    tier: 'Gold',
  }

  const recentPosts = [
    { id: 1, platform: 'Twitter', content: 'Just made my first trade on @QRDXTrade! 🚀', rewards: 50, engagement: 1234 },
    { id: 2, platform: 'Telegram', content: 'QRDX has the best DEX experience!', rewards: 35, engagement: 890 },
    { id: 3, platform: 'Discord', content: 'Loving the quantum-resistant security', rewards: 42, engagement: 1056 },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation />

      <main className="flex-1 pt-20 pb-8">
        <div className="container mx-auto px-4">
          {/* Header Section */}
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Sparkles className="h-4 w-4" />
              Earn Rewards Program
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Become a QRDX Partner
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Share QRDX on social media and earn rewards. Connect your wallet to get started!
            </p>
          </motion.div>

          {!walletConnected ? (
            /* Wallet Connection Section */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="max-w-2xl mx-auto border-2 border-primary/20">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Wallet className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Connect Your QRDX Wallet</h2>
                  <p className="text-muted-foreground mb-6">
                    You need a QRDX wallet to participate in the partner program and receive rewards
                  </p>
                  <Button 
                    size="lg" 
                    onClick={() => router.push('/wallets')}
                    className="gap-2"
                  >
                    <Wallet className="h-5 w-5" />
                    Connect Wallet
                  </Button>
                </CardContent>
              </Card>

              {/* Benefits Section */}
              <div className="grid md:grid-cols-3 gap-6 mt-12 max-w-4xl mx-auto">
                <Card className="text-center p-6">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="font-bold mb-2">Earn Rewards</h3>
                  <p className="text-sm text-muted-foreground">
                    Get paid in QRDX tokens for every post you share
                  </p>
                </Card>

                <Card className="text-center p-6">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="h-6 w-6 text-blue-500" />
                  </div>
                  <h3 className="font-bold mb-2">Tiered System</h3>
                  <p className="text-sm text-muted-foreground">
                    Higher engagement = higher rewards multiplier
                  </p>
                </Card>

                <Card className="text-center p-6">
                  <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                    <Users className="h-6 w-6 text-purple-500" />
                  </div>
                  <h3 className="font-bold mb-2">Build Community</h3>
                  <p className="text-sm text-muted-foreground">
                    Help grow QRDX while earning passive income
                  </p>
                </Card>
              </div>
            </motion.div>
          ) : (
            /* Partner Dashboard */
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Total Earned</span>
                      <DollarSign className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="text-2xl font-bold">{userStats.totalEarned} QRDX</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Posts Shared</span>
                      <Share2 className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="text-2xl font-bold">{userStats.postsShared}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Total Engagement</span>
                      <TrendingUp className="h-4 w-4 text-purple-500" />
                    </div>
                    <div className="text-2xl font-bold">{userStats.engagement.toLocaleString()}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Partner Tier</span>
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                    </div>
                    <div className="text-2xl font-bold">{userStats.tier}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Submit New Post */}
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Submit a New Post</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Post Content</label>
                      <Textarea
                        placeholder="Share your thoughts about QRDX..."
                        value={postContent}
                        onChange={(e) => setPostContent(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Post Link (Twitter, Telegram, etc.)</label>
                      <Input
                        placeholder="https://twitter.com/..."
                        value={postLink}
                        onChange={(e) => setPostLink(e.target.value)}
                      />
                    </div>
                    <Button className="w-full" size="lg">
                      <CheckCircle className="mr-2 h-5 w-5" />
                      Submit for Review
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Posts are reviewed within 24 hours. Rewards are distributed automatically upon approval.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Posts */}
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Your Recent Posts</h2>
                  <div className="space-y-4">
                    {recentPosts.map((post) => (
                      <div key={post.id} className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 border">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          {post.platform === 'Twitter' ? (
                            <Twitter className="h-5 w-5 text-[#1DA1F2]" />
                          ) : (
                            <MessageCircle className="h-5 w-5 text-[#0088cc]" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{post.platform}</Badge>
                            <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">
                              +{post.rewards} QRDX
                            </Badge>
                          </div>
                          <p className="text-sm mb-2">{post.content}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{post.engagement.toLocaleString()} engagements</span>
                            <span>•</span>
                            <span className="text-green-500">Approved</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Tier Information */}
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-bold mb-4">Partner Tiers & Rewards</h2>
                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg border text-center">
                      <div className="text-lg font-bold mb-1">Bronze</div>
                      <div className="text-sm text-muted-foreground mb-2">0-10 posts</div>
                      <div className="text-2xl font-bold text-bronze">1x</div>
                    </div>
                    <div className="p-4 rounded-lg border text-center">
                      <div className="text-lg font-bold mb-1">Silver</div>
                      <div className="text-sm text-muted-foreground mb-2">11-25 posts</div>
                      <div className="text-2xl font-bold text-gray-400">1.5x</div>
                    </div>
                    <div className="p-4 rounded-lg border-2 border-yellow-500 text-center bg-yellow-500/5">
                      <div className="text-lg font-bold mb-1">Gold</div>
                      <div className="text-sm text-muted-foreground mb-2">26-50 posts</div>
                      <div className="text-2xl font-bold text-yellow-500">2x</div>
                      <Badge className="mt-2 bg-yellow-500">Current</Badge>
                    </div>
                    <div className="p-4 rounded-lg border text-center">
                      <div className="text-lg font-bold mb-1">Platinum</div>
                      <div className="text-sm text-muted-foreground mb-2">51+ posts</div>
                      <div className="text-2xl font-bold text-purple-500">3x</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
