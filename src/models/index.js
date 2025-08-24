const Competition = require('./Competition');
const Team = require('./Team');
const Match = require('./Match');
const Prediction = require('./Prediction');

// Define associations
Competition.hasMany(Match, {
  foreignKey: 'competitionId',
  as: 'matches',
});

Match.belongsTo(Competition, {
  foreignKey: 'competitionId',
  as: 'competition',
});

Team.hasMany(Match, {
  foreignKey: 'homeTeamId',
  as: 'homeMatches',
});

Team.hasMany(Match, {
  foreignKey: 'awayTeamId',
  as: 'awayMatches',
});

Match.belongsTo(Team, {
  foreignKey: 'homeTeamId',
  as: 'homeTeam',
});

Match.belongsTo(Team, {
  foreignKey: 'awayTeamId',
  as: 'awayTeam',
});

Match.hasMany(Prediction, {
  foreignKey: 'matchId',
  as: 'predictions',
});

Prediction.belongsTo(Match, {
  foreignKey: 'matchId',
  as: 'match',
});

module.exports = {
  Competition,
  Team,
  Match,
  Prediction,
};
