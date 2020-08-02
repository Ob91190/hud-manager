import * as I from './../../../types/interfaces';
import * as Formats from './formats';
import * as M from './../match';
import uuidv4 from 'uuid/v4';
import db from './../../../init/database';

const { tournaments } = db;

export const getTournaments = (): Promise<I.Tournament[]> => new Promise((res, rej) => {
    tournaments.find({}, (err, docs) => {
        if(err) return res([]);
        return res(docs);
    });
});

export const createTournament = (type: string, teams: number): I.Tournament => {
    const tournament = {
        _id: '',
        name: '',
        logo: '',
        matchups: [],
        autoCreate: true,
    }
    switch (type) {
        case "se":
            tournament.matchups = Formats.createSEBracket(teams);
            break;
        default:

            break;
    }
    return tournament;
}

export const addTournament = (tournament: I.Tournament): Promise<I.Tournament> => new Promise((res, rej) => {
    tournaments.insert(tournament, (err, newTournament) => {
        if(err) return res(null);
        return newTournament;
    });
});

export const getTournament = (tournamentId: string): Promise<I.Tournament | null> => new Promise((res, rej) => {
    tournaments.findOne({ _id: tournamentId }, (err, tournament) => {
        if (err || !tournament) return res(null);
        return res(tournament);
    });
});

export const bindMatch = (matchId: string, matchupId: string, tournamentId: string): Promise<I.Tournament | null> => new Promise(async (res, rej) => {
    const tournament = await getTournament(tournamentId);
    if (!tournament) return res(null);
    const matchup = tournament.matchups.find(matchup => matchup._id === matchupId);
    if(!matchup) return res(null);
    matchup.matchId = matchId;
    
    return await updateTournament(tournament);
});

export const updateTournament = (tournament: I.Tournament): Promise<I.Tournament | null> => new Promise((res, rej) => {
    tournaments.update({ _id: tournament._id }, tournament, {}, (err, up) => {
        if(err) return res(null);
        return res(tournament);
    });
});

export const createNextMatch = async (matchId: string) => new Promise((res, rej) => {
    const maxWins = (type: I.BOTypes) => {
        switch (type) {
            case "bo1":
                return 1;
            case "bo3":
                return 2;
            case "bo5":
                return 3;
            default:
                return 2;
        }
    }

    tournaments.findOne({ $where: function () { return !!this.matchups.find(matchup => matchup.matchId === matchId) } }, async (err, tournament) => {
        if (err || !tournament) return res(null);
        const matchup = tournament.matchups.find(matchup => matchup.matchId === matchId);
        if (!matchup || !matchup.winner_to) return res(null);

        const nextMatchup = tournament.matchups.find(next => next._id === matchup.winner_to);
        if (!nextMatchup) return res(null);

        const match = await M.getMatchById(matchId);
        if (!match) return res(null);

        const winsRequired = maxWins(match.matchType);

        if (match.left.wins !== winsRequired && match.right.wins !== winsRequired) return res(null);

        const winnerId = match.left.wins > match.right.wins ? match.left.id : match.right.id;

        if (!nextMatchup.matchId) {

            const newMatch: I.Match = {
                id: uuidv4(),
                current: false,
                left: { id: winnerId, wins: 0 },
                right: { id: null, wins: 0 },
                matchType: 'bo1',
                vetos: []
            }

            for (let i = 0; i < 7; i++) {
                newMatch.vetos.push({ teamId: '', mapName: '', side: 'NO', type: 'pick', mapEnd: false, reverseSide: false });
            }

            const resp = await M.addMatch(newMatch);
            if(!resp) return res(null);

            nextMatchup.matchId = newMatch.id;
            await updateTournament(tournament);
        }

        const nextMatch = await M.getMatchById(nextMatchup.matchId);
        if(!nextMatch) return res(null);
        if(nextMatch.left.id === winnerId || nextMatch.right.id === winnerId) return res(nextMatch);
        if(!nextMatch.left.id){
            nextMatch.left.id = winnerId;
        } else if(!nextMatch.right.id){
            nextMatch.right.id = winnerId;
        } else {
            return res(null);
        }
        await M.updateMatch(nextMatch);
        return res(nextMatch);
    });
});

export const deleteTournament = (tournamentId: string) => new Promise((res, rej) => {
    tournaments.remove({ _id: tournamentId }, (err, n) => {
        if(!err) return res(null);
        return res(true);
    });
});