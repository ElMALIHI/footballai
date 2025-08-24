const logger = require('../config/logger');
const { Match, Prediction, Team } = require('../models');
const { Op } = require('sequelize');
const AIPredictor = require('./AIPredictor');

class BettingAnalyzer {
  constructor() {
    this.aiPredictor = new AIPredictor();
    this.minValueThreshold = parseFloat(process.env.BETTING_MIN_VALUE_THRESHOLD) || 0.05;
    this.maxKellyFraction = parseFloat(process.env.BETTING_MAX_KELLY_FRACTION) || 0.25;
    this.minConfidenceThreshold = parseFloat(process.env.BETTING_MIN_CONFIDENCE_THRESHOLD) || 0.6;
  }

  /**
   * Analyze betting odds and find value bets
   */
  async analyzeBettingOdds(matchId, odds = null) {
    try {
      logger.info(`Analyzing betting odds for match ${matchId}`);

      // Get match data
      const match = await Match.findByPk(matchId, {
        include: [
          { model: Team, as: 'homeTeam' },
          { model: Team, as: 'awayTeam' },
        ],
      });

      if (!match) {
        throw new Error(`Match with ID ${matchId} not found`);
      }

      // Get AI prediction
      const prediction = await this.aiPredictor.predictMatch(matchId);
      
      // Use provided odds or extract from match
      const matchOdds = odds || this.extractOddsFromMatch(match);
      
      if (!matchOdds) {
        throw new Error('No betting odds available for analysis');
      }

      // Calculate implied probabilities from odds
      const impliedProbabilities = this.calculateImpliedProbabilities(matchOdds);
      
      // Compare with AI predictions
      const valueAnalysis = this.findValueBets(
        prediction.probabilities,
        impliedProbabilities,
        matchOdds
      );

      // Calculate Kelly Criterion
      const kellyRecommendations = this.calculateKellyCriterion(
        prediction.probabilities,
        matchOdds
      );

      // Generate betting recommendations
      const recommendations = this.generateBettingRecommendations(
        valueAnalysis,
        kellyRecommendations,
        prediction.confidence
      );

      // Calculate expected value
      const expectedValues = this.calculateExpectedValues(
        prediction.probabilities,
        matchOdds
      );

      return {
        matchId,
        match: {
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          utcDate: match.utcDate,
        },
        odds: matchOdds,
        aiPrediction: {
          predictedWinner: prediction.prediction.predictedWinner,
          confidence: prediction.confidence,
          probabilities: prediction.probabilities,
        },
        impliedProbabilities,
        valueAnalysis,
        kellyRecommendations,
        expectedValues,
        recommendations,
        analysisTimestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error analyzing betting odds for match ${matchId}:`, error);
      throw error;
    }
  }

  /**
   * Extract odds from match data
   */
  extractOddsFromMatch(match) {
    const odds = {};
    
    if (match.homeTeamWinOdds) odds.homeWin = parseFloat(match.homeTeamWinOdds);
    if (match.drawOdds) odds.draw = parseFloat(match.drawOdds);
    if (match.awayTeamWinOdds) odds.awayWin = parseFloat(match.awayTeamWinOdds);
    
    // Check if we have valid odds
    if (Object.keys(odds).length === 0) {
      return null;
    }
    
    return odds;
  }

  /**
   * Calculate implied probabilities from odds
   */
  calculateImpliedProbabilities(odds) {
    const probabilities = {};
    
    if (odds.homeWin) {
      probabilities.HOME_TEAM = 1 / odds.homeWin;
    }
    if (odds.draw) {
      probabilities.DRAW = 1 / odds.draw;
    }
    if (odds.awayWin) {
      probabilities.AWAY_TEAM = 1 / odds.awayWin;
    }

    // Normalize probabilities to sum to 1
    const total = Object.values(probabilities).reduce((sum, prob) => sum + prob, 0);
    
    Object.keys(probabilities).forEach(key => {
      probabilities[key] = probabilities[key] / total;
    });

    return probabilities;
  }

  /**
   * Find value bets by comparing AI predictions with implied probabilities
   */
  findValueBets(aiProbabilities, impliedProbabilities, odds) {
    const valueBets = [];
    
    Object.keys(aiProbabilities).forEach(outcome => {
      const aiProb = aiProbabilities[outcome];
      const impliedProb = impliedProbabilities[outcome] || 0;
      
      if (impliedProb > 0) {
        const value = aiProb - impliedProb;
        const valuePercentage = (value / impliedProb) * 100;
        
        if (value > this.minValueThreshold) {
          const betOdds = this.getOddsForOutcome(odds, outcome);
          
          valueBets.push({
            outcome,
            aiProbability: aiProb,
            impliedProbability: impliedProb,
            value,
            valuePercentage,
            odds: betOdds,
            isValueBet: true,
          });
        } else {
          valueBets.push({
            outcome,
            aiProbability: aiProb,
            impliedProbability: impliedProb,
            value,
            valuePercentage,
            odds: this.getOddsForOutcome(odds, outcome),
            isValueBet: false,
          });
        }
      }
    });

    return valueBets.sort((a, b) => b.value - a.value);
  }

  /**
   * Get odds for a specific outcome
   */
  getOddsForOutcome(odds, outcome) {
    switch (outcome) {
      case 'HOME_TEAM':
        return odds.homeWin;
      case 'AWAY_TEAM':
        return odds.awayWin;
      case 'DRAW':
        return odds.draw;
      default:
        return null;
    }
  }

  /**
   * Calculate Kelly Criterion for optimal bet sizing
   */
  calculateKellyCriterion(aiProbabilities, odds) {
    const kellyRecommendations = [];
    
    Object.keys(aiProbabilities).forEach(outcome => {
      const aiProb = aiProbabilities[outcome];
      const betOdds = this.getOddsForOutcome(odds, outcome);
      
      if (betOdds && aiProb > 0) {
        const kellyFraction = (aiProb * betOdds - 1) / (betOdds - 1);
        
        // Cap Kelly fraction for risk management
        const cappedFraction = Math.min(kellyFraction, this.maxKellyFraction);
        
        kellyRecommendations.push({
          outcome,
          kellyFraction,
          cappedFraction,
          recommendedStake: cappedFraction > 0 ? cappedFraction : 0,
          isRecommended: cappedFraction > 0,
        });
      }
    });

    return kellyRecommendations.sort((a, b) => b.recommendedStake - a.recommendedStake);
  }

  /**
   * Calculate expected values for each outcome
   */
  calculateExpectedValues(aiProbabilities, odds) {
    const expectedValues = [];
    
    Object.keys(aiProbabilities).forEach(outcome => {
      const aiProb = aiProbabilities[outcome];
      const betOdds = this.getOddsForOutcome(odds, outcome);
      
      if (betOdds) {
        const expectedValue = (aiProb * (betOdds - 1)) - (1 - aiProb);
        const roi = expectedValue * 100;
        
        expectedValues.push({
          outcome,
          expectedValue,
          roi,
          isPositive: expectedValue > 0,
        });
      }
    });

    return expectedValues.sort((a, b) => b.expectedValue - a.expectedValue);
  }

  /**
   * Generate comprehensive betting recommendations
   */
  generateBettingRecommendations(valueAnalysis, kellyRecommendations, aiConfidence) {
    const recommendations = {
      overallRecommendation: 'AVOID',
      confidence: aiConfidence,
      bestValueBet: null,
      bestKellyBet: null,
      riskLevel: 'HIGH',
      reasoning: [],
    };

    // Check confidence threshold
    if (aiConfidence < this.minConfidenceThreshold) {
      recommendations.reasoning.push(`Low AI confidence (${aiConfidence.toFixed(3)})`);
      return recommendations;
    }

    // Find best value bet
    const valueBets = valueAnalysis.filter(bet => bet.isValueBet);
    if (valueBets.length > 0) {
      recommendations.bestValueBet = valueBets[0];
      recommendations.reasoning.push(`Value bet found: ${valueBets[0].outcome} (${valueBets[0].valuePercentage.toFixed(1)}% value)`);
    }

    // Find best Kelly bet
    const kellyBets = kellyRecommendations.filter(bet => bet.isRecommended);
    if (kellyBets.length > 0) {
      recommendations.bestKellyBet = kellyBets[0];
      recommendations.reasoning.push(`Kelly bet: ${kellyBets[0].outcome} (${(kellyBets[0].recommendedStake * 100).toFixed(1)}% stake)`);
    }

    // Determine overall recommendation
    if (valueBets.length > 0 && kellyBets.length > 0) {
      recommendations.overallRecommendation = 'STRONG_BUY';
      recommendations.riskLevel = 'MEDIUM';
    } else if (valueBets.length > 0 || kellyBets.length > 0) {
      recommendations.overallRecommendation = 'BUY';
      recommendations.riskLevel = 'MEDIUM_HIGH';
    } else {
      recommendations.reasoning.push('No value bets or Kelly recommendations found');
    }

    return recommendations;
  }

  /**
   * Analyze multiple matches for betting opportunities
   */
  async analyzeMultipleMatches(matchIds, oddsMap = {}) {
    try {
      logger.info(`Analyzing betting opportunities for ${matchIds.length} matches`);

      const results = [];
      const errors = [];

      for (const matchId of matchIds) {
        try {
          const odds = oddsMap[matchId] || null;
          const analysis = await this.analyzeBettingOdds(matchId, odds);
          results.push(analysis);
        } catch (error) {
          logger.error(`Error analyzing match ${matchId}:`, error);
          errors.push({ matchId, error: error.message });
        }
      }

      // Filter for recommended bets
      const recommendedBets = results.filter(result => 
        result.recommendations.overallRecommendation !== 'AVOID'
      );

      // Sort by value
      recommendedBets.sort((a, b) => {
        const aValue = a.valueAnalysis[0]?.value || 0;
        const bValue = b.valueAnalysis[0]?.value || 0;
        return bValue - aValue;
      });

      return {
        totalMatches: matchIds.length,
        analyzed: results.length,
        errors: errors.length,
        recommendedBets: recommendedBets.length,
        results,
        topRecommendations: recommendedBets.slice(0, 5),
        summary: this.generateBettingSummary(recommendedBets),
      };
    } catch (error) {
      logger.error('Error in multiple match analysis:', error);
      throw error;
    }
  }

  /**
   * Generate betting summary statistics
   */
  generateBettingSummary(recommendedBets) {
    if (recommendedBets.length === 0) {
      return {
        averageValue: 0,
        averageConfidence: 0,
        totalExpectedValue: 0,
        riskDistribution: {},
      };
    }

    const totalValue = recommendedBets.reduce((sum, bet) => 
      sum + (bet.valueAnalysis[0]?.value || 0), 0
    );
    
    const totalConfidence = recommendedBets.reduce((sum, bet) => 
      sum + bet.aiPrediction.confidence, 0
    );
    
    const totalExpectedValue = recommendedBets.reduce((sum, bet) => 
      sum + (bet.expectedValues[0]?.expectedValue || 0), 0
    );

    const riskDistribution = {
      STRONG_BUY: recommendedBets.filter(b => b.recommendations.overallRecommendation === 'STRONG_BUY').length,
      BUY: recommendedBets.filter(b => b.recommendations.overallRecommendation === 'BUY').length,
      AVOID: recommendedBets.filter(b => b.recommendations.overallRecommendation === 'AVOID').length,
    };

    return {
      averageValue: totalValue / recommendedBets.length,
      averageConfidence: totalConfidence / recommendedBets.length,
      totalExpectedValue,
      riskDistribution,
      totalRecommendations: recommendedBets.length,
    };
  }

  /**
   * Get betting performance history
   */
  async getBettingPerformance(options = {}) {
    const {
      days = 30,
      minConfidence = 0.6,
      includeAllBets = false,
    } = options;

    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const predictions = await Prediction.findAll({
        where: {
          confidence: { [Op.gte]: minConfidence },
          predictionTimestamp: { [Op.gte]: cutoffDate },
          isProcessed: true,
        },
        include: [
          {
            model: Match,
            as: 'match',
            where: { status: 'FINISHED' },
            include: [
              { model: Team, as: 'homeTeam' },
              { model: Team, as: 'awayTeam' },
            ],
          },
        ],
      });

      const performance = this.calculateBettingPerformance(predictions, includeAllBets);

      return {
        period: `${days} days`,
        minConfidence,
        totalBets: predictions.length,
        performance,
        recommendations: this.generatePerformanceRecommendations(performance),
      };
    } catch (error) {
      logger.error('Error getting betting performance:', error);
      throw error;
    }
  }

  /**
   * Calculate betting performance metrics
   */
  calculateBettingPerformance(predictions, includeAllBets) {
    if (predictions.length === 0) {
      return {
        accuracy: 0,
        roi: 0,
        totalBets: 0,
        winningBets: 0,
        losingBets: 0,
        averageOdds: 0,
        profitLoss: 0,
      };
    }

    let totalBets = 0;
    let winningBets = 0;
    let totalStake = 0;
    let totalReturn = 0;
    let totalOdds = 0;

    predictions.forEach(prediction => {
      // Simulate betting performance (in real implementation, you'd have actual bet data)
      const stake = 100; // Assume $100 stake per bet
      const odds = this.estimateOddsFromPrediction(prediction);
      
      totalBets++;
      totalStake += stake;
      totalOdds += odds;

      if (prediction.isCorrect) {
        winningBets++;
        totalReturn += stake * odds;
      }
    });

    const accuracy = winningBets / totalBets;
    const profitLoss = totalReturn - totalStake;
    const roi = (profitLoss / totalStake) * 100;
    const averageOdds = totalOdds / totalBets;

    return {
      accuracy,
      roi,
      totalBets,
      winningBets,
      losingBets: totalBets - winningBets,
      averageOdds,
      profitLoss,
      totalStake,
      totalReturn,
    };
  }

  /**
   * Estimate odds from prediction confidence (placeholder)
   */
  estimateOddsFromPrediction(prediction) {
    // This is a simplified estimation - in reality, you'd use actual odds
    const confidence = prediction.confidence;
    return 1 + (1 - confidence) * 2; // Higher confidence = lower odds
  }

  /**
   * Generate performance-based recommendations
   */
  generatePerformanceRecommendations(performance) {
    const recommendations = [];

    if (performance.roi > 10) {
      recommendations.push('Excellent performance - consider increasing bet sizes');
    } else if (performance.roi > 0) {
      recommendations.push('Positive ROI - maintain current strategy');
    } else if (performance.roi > -5) {
      recommendations.push('Slight losses - review betting criteria');
    } else {
      recommendations.push('Significant losses - consider strategy adjustment');
    }

    if (performance.accuracy < 0.5) {
      recommendations.push('Low accuracy - review model performance');
    }

    if (performance.averageOdds > 2.5) {
      recommendations.push('High average odds - consider more conservative bets');
    }

    return recommendations;
  }

  /**
   * Get betting trends and patterns
   */
  async getBettingTrends(options = {}) {
    const {
      days = 90,
      competitionId = null,
      outcome = null,
    } = options;

    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const whereConditions = {
        predictionTimestamp: { [Op.gte]: cutoffDate },
        isProcessed: true,
      };

      if (competitionId) {
        whereConditions['$match.competitionId$'] = competitionId;
      }

      if (outcome) {
        whereConditions.predictedWinner = outcome;
      }

      const predictions = await Prediction.findAll({
        where: whereConditions,
        include: [
          {
            model: Match,
            as: 'match',
            include: [
              { model: require('../models').Competition, as: 'competition' },
            ],
          },
        ],
        order: [['predictionTimestamp', 'ASC']],
      });

      return this.analyzeBettingTrends(predictions);
    } catch (error) {
      logger.error('Error getting betting trends:', error);
      throw error;
    }
  }

  /**
   * Analyze betting trends from prediction data
   */
  analyzeBettingTrends(predictions) {
    const trends = {
      accuracyByMonth: {},
      accuracyByCompetition: {},
      accuracyByOutcome: {},
      confidenceTrends: [],
      valueBetSuccess: {},
    };

    predictions.forEach(prediction => {
      const month = new Date(prediction.predictionTimestamp).toISOString().slice(0, 7);
      const competition = prediction.match?.competition?.name || 'Unknown';
      const outcome = prediction.predictedWinner;

      // Monthly accuracy
      if (!trends.accuracyByMonth[month]) {
        trends.accuracyByMonth[month] = { correct: 0, total: 0 };
      }
      trends.accuracyByMonth[month].total++;
      if (prediction.isCorrect) trends.accuracyByMonth[month].correct++;

      // Competition accuracy
      if (!trends.accuracyByCompetition[competition]) {
        trends.accuracyByCompetition[competition] = { correct: 0, total: 0 };
      }
      trends.accuracyByCompetition[competition].total++;
      if (prediction.isCorrect) trends.accuracyByCompetition[competition].correct++;

      // Outcome accuracy
      if (!trends.accuracyByOutcome[outcome]) {
        trends.accuracyByOutcome[outcome] = { correct: 0, total: 0 };
      }
      trends.accuracyByOutcome[outcome].total++;
      if (prediction.isCorrect) trends.accuracyByOutcome[outcome].correct++;

      // Confidence trends
      trends.confidenceTrends.push({
        date: prediction.predictionTimestamp,
        confidence: prediction.confidence,
        isCorrect: prediction.isCorrect,
      });
    });

    // Calculate percentages
    Object.keys(trends.accuracyByMonth).forEach(month => {
      const data = trends.accuracyByMonth[month];
      data.accuracy = data.total > 0 ? data.correct / data.total : 0;
    });

    Object.keys(trends.accuracyByCompetition).forEach(competition => {
      const data = trends.accuracyByCompetition[competition];
      data.accuracy = data.total > 0 ? data.correct / data.total : 0;
    });

    Object.keys(trends.accuracyByOutcome).forEach(outcome => {
      const data = trends.accuracyByOutcome[outcome];
      data.accuracy = data.total > 0 ? data.correct / data.total : 0;
    });

    return trends;
  }
}

module.exports = BettingAnalyzer;
