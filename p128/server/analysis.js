const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteToName(noteNumber) {
    const octave = Math.floor(noteNumber / 12) - 1;
    const noteIndex = noteNumber % 12;
    return NOTE_NAMES[noteIndex] + octave;
}

function nameToNote(noteName) {
    const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
    if (!match) return null;
    
    const noteIndex = NOTE_NAMES.indexOf(match[1]);
    const octave = parseInt(match[2], 10);
    
    if (noteIndex === -1) return null;
    return (octave + 1) * 12 + noteIndex;
}

function isBlackKey(noteNumber) {
    const noteIndex = noteNumber % 12;
    return [1, 3, 6, 8, 10].includes(noteIndex);
}

function analyzePerformance(performanceData) {
    const { sheetId, expectedNotes, playedNotes } = performanceData;
    
    if (!expectedNotes || expectedNotes.length === 0) {
        return {
            accuracy: 0,
            totalNotes: 0,
            correctNotes: 0,
            wrongNotes: 0,
            details: [],
            suggestions: []
        };
    }

    let correctCount = 0;
    let wrongCount = 0;
    const details = [];
    const missedNotes = [];
    const wrongNotesList = [];

    const expectedMap = new Map();
    expectedNotes.forEach((note, index) => {
        const noteNumber = typeof note === 'object' ? note.noteNumber : nameToNote(note.note);
        expectedMap.set(index, {
            ...note,
            noteNumber,
            expectedIndex: index,
            played: false
        });
    });

    playedNotes.forEach((played, playIndex) => {
        const expectedForIndex = expectedMap.get(playIndex);
        
        if (expectedForIndex) {
            const isCorrect = played.note === expectedForIndex.noteNumber;
            
            if (isCorrect) {
                correctCount++;
                expectedForIndex.played = true;
                details.push({
                    index: playIndex,
                    expected: expectedForIndex.noteNumber,
                    expectedName: noteToName(expectedForIndex.noteNumber),
                    played: played.note,
                    playedName: noteToName(played.note),
                    correct: true,
                    velocity: played.velocity,
                    timing: played.timestamp
                });
            } else {
                wrongCount++;
                wrongNotesList.push({
                    expected: expectedForIndex.noteNumber,
                    expectedName: noteToName(expectedForIndex.noteNumber),
                    played: played.note,
                    playedName: noteToName(played.note),
                    index: playIndex
                });
                details.push({
                    index: playIndex,
                    expected: expectedForIndex.noteNumber,
                    expectedName: noteToName(expectedForIndex.noteNumber),
                    played: played.note,
                    playedName: noteToName(played.note),
                    correct: false,
                    velocity: played.velocity,
                    timing: played.timestamp
                });
            }
        }
    });

    expectedMap.forEach((expected, index) => {
        if (!expected.played && index < playedNotes.length) {
            missedNotes.push({
                index,
                note: expected.noteNumber,
                noteName: noteToName(expected.noteNumber)
            });
        }
    });

    const totalPlayed = playedNotes.length;
    const accuracy = totalPlayed > 0 ? Math.round((correctCount / totalPlayed) * 100) : 0;

    const suggestions = generateSuggestions({
        accuracy,
        correctCount,
        wrongCount,
        totalPlayed,
        wrongNotesList,
        missedNotes,
        details
    });

    return {
        accuracy,
        totalNotes: expectedNotes.length,
        totalPlayed,
        correctNotes: correctCount,
        wrongNotes: wrongCount,
        missedNotes: missedNotes.length,
        details,
        suggestions,
        wrongNotesList,
        missedNotesList: missedNotes
    };
}

function generateSuggestions(analysis) {
    const suggestions = [];

    if (analysis.accuracy >= 90) {
        suggestions.push({
            type: 'praise',
            priority: 1,
            message: '太棒了！你的准确率非常高，继续保持！'
        });
    } else if (analysis.accuracy >= 70) {
        suggestions.push({
            type: 'encouragement',
            priority: 1,
            message: '做得不错！再练习几次就能达到优秀水平。'
        });
    } else if (analysis.accuracy >= 50) {
        suggestions.push({
            type: 'encouragement',
            priority: 1,
            message: '继续加油！放慢速度，确保每个音符都准确。'
        });
    } else {
        suggestions.push({
            type: 'advice',
            priority: 1,
            message: '建议先放慢速度练习，熟悉音符位置后再逐渐提速。'
        });
    }

    if (analysis.wrongNotesList.length > 0) {
        const wrongPatterns = analyzeWrongNotePatterns(analysis.wrongNotesList);
        
        if (wrongPatterns.octaveErrors > 0) {
            suggestions.push({
                type: 'technique',
                priority: 2,
                message: `发现 ${wrongPatterns.octaveErrors} 个八度错误，注意看清音符所在的八度位置。`
            });
        }
        
        if (wrongPatterns.adjacentErrors > 0) {
            suggestions.push({
                type: 'technique',
                priority: 2,
                message: `发现 ${wrongPatterns.adjacentErrors} 个相邻键错误，注意手指的准确位置。`
            });
        }

        if (wrongPatterns.blackKeyErrors > 0) {
            suggestions.push({
                type: 'technique',
                priority: 2,
                message: `发现 ${wrongPatterns.blackKeyErrors} 个黑键错误，注意升降号的识别。`
            });
        }

        const frequentMistakes = findFrequentMistakes(analysis.wrongNotesList);
        if (frequentMistakes.length > 0) {
            suggestions.push({
                type: 'practice',
                priority: 3,
                message: `经常出错的音符: ${frequentMistakes.slice(0, 3).join(', ')}，建议单独练习这些音程。`
            });
        }
    }

    if (analysis.missedNotesList.length > 0) {
        suggestions.push({
            type: 'rhythm',
            priority: 2,
            message: `有 ${analysis.missedNotesList.length} 个音符漏弹，注意节拍的稳定性，可以使用节拍器辅助练习。`
        });
    }

    if (analysis.details.length > 0) {
        const velocityAnalysis = analyzeVelocity(analysis.details);
        if (velocityAnalysis.inconsistent) {
            suggestions.push({
                type: 'expression',
                priority: 4,
                message: '力度变化有些不稳定，尝试保持更均匀的触键力度。'
            });
        }
    }

    return suggestions;
}

function analyzeWrongNotePatterns(wrongNotes) {
    let octaveErrors = 0;
    let adjacentErrors = 0;
    let blackKeyErrors = 0;

    wrongNotes.forEach(wrong => {
        const diff = Math.abs(wrong.played - wrong.expected);
        
        if (diff === 12) {
            octaveErrors++;
        }
        if (diff === 1 || diff === 2) {
            adjacentErrors++;
        }
        if (isBlackKey(wrong.expected) && !isBlackKey(wrong.played)) {
            blackKeyErrors++;
        }
    });

    return { octaveErrors, adjacentErrors, blackKeyErrors };
}

function findFrequentMistakes(wrongNotes) {
    const mistakeCount = new Map();
    
    wrongNotes.forEach(wrong => {
        const key = `${noteToName(wrong.expected)}→${noteToName(wrong.played)}`;
        mistakeCount.set(key, (mistakeCount.get(key) || 0) + 1);
    });

    return Array.from(mistakeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(entry => entry[0]);
}

function analyzeVelocity(details) {
    const correctDetails = details.filter(d => d.correct);
    if (correctDetails.length < 3) {
        return { inconsistent: false };
    }

    const velocities = correctDetails.map(d => d.velocity);
    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const variance = velocities.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / velocities.length;
    const stdDev = Math.sqrt(variance);

    return {
        inconsistent: stdDev > 20,
        averageVelocity: Math.round(avg),
        velocityStdDev: Math.round(stdDev)
    };
}

function getFingerSuggestions(note, context = {}) {
    const { previousNote, nextNote, currentFinger, hand = 'right' } = context;
    
    const suggestions = [];
    const noteNumber = typeof note === 'number' ? note : nameToNote(note);
    
    if (noteNumber === null) {
        return { suggestions: [], recommendedFinger: null };
    }

    const recommendedFinger = recommendFinger(noteNumber, previousNote, currentFinger, hand);
    
    suggestions.push({
        finger: recommendedFinger,
        confidence: calculateConfidence(noteNumber, previousNote, nextNote),
        reason: generateFingerReason(noteNumber, previousNote, nextNote, recommendedFinger, hand)
    });

    if (previousNote) {
        const prevNoteNumber = typeof previousNote === 'number' ? previousNote : 
            (typeof previousNote === 'object' ? previousNote.noteNumber : nameToNote(previousNote.note));
        
        const transitionTip = getFingerTransitionTip(
            prevNoteNumber, 
            noteNumber, 
            previousNote.finger, 
            recommendedFinger,
            hand
        );
        
        if (transitionTip) {
            suggestions.push({
                type: 'transition',
                message: transitionTip
            });
        }
    }

    if (nextNote) {
        const nextNoteNumber = typeof nextNote === 'number' ? nextNote : 
            (typeof nextNote === 'object' ? nextNote.noteNumber : nameToNote(nextNote.note));
        
        const prepTip = getPreparationTip(noteNumber, nextNoteNumber, recommendedFinger, hand);
        if (prepTip) {
            suggestions.push({
                type: 'preparation',
                message: prepTip
            });
        }
    }

    return {
        note: noteToName(noteNumber),
        noteNumber,
        recommendedFinger,
        suggestions
    };
}

function recommendFinger(noteNumber, previousNote, currentFinger, hand) {
    const prevNoteNumber = previousNote ? 
        (typeof previousNote === 'number' ? previousNote : 
         (typeof previousNote === 'object' ? previousNote.noteNumber : nameToNote(previousNote.note))) : null;
    
    const prevFinger = previousNote && previousNote.finger ? previousNote.finger : null;
    
    if (prevNoteNumber === null || prevFinger === null) {
        return suggestDefaultFinger(noteNumber, hand);
    }

    const semitoneDiff = noteNumber - prevNoteNumber;
    
    if (semitoneDiff > 2 && prevFinger >= 3 && !isBlackKey(noteNumber)) {
        return 1;
    }
    
    if (semitoneDiff < -2 && prevFinger === 1) {
        return suggestFingerAfterThumb(semitoneDiff, hand);
    }
    
    if (Math.abs(semitoneDiff) <= 2) {
        const targetFinger = prevFinger + (semitoneDiff > 0 ? 1 : semitoneDiff < 0 ? -1 : 0);
        if (targetFinger >= 1 && targetFinger <= 5) {
            return targetFinger;
        }
    }
    
    if (semitoneDiff === 0 && prevFinger) {
        const alternatives = [1, 2, 3, 4, 5].filter(f => f !== prevFinger);
        return alternatives[Math.floor(Math.random() * alternatives.length)];
    }
    
    return suggestDefaultFinger(noteNumber, hand);
}

function suggestDefaultFinger(noteNumber, hand) {
    const noteInOctave = noteNumber % 12;
    const isBlack = isBlackKey(noteNumber);
    
    if (isBlack) {
        return hand === 'right' ? 3 : 3;
    }
    
    const fingerMap = [1, 2, 2, 3, 3, 4, 4, 5, 1, 1, 2, 2];
    return fingerMap[noteInOctave] || 3;
}

function suggestFingerAfterThumb(semitoneDiff, hand) {
    const absDiff = Math.abs(semitoneDiff);
    if (absDiff <= 2) return 2;
    if (absDiff <= 4) return 3;
    if (absDiff <= 6) return 4;
    return 5;
}

function calculateConfidence(noteNumber, previousNote, nextNote) {
    let confidence = 70;
    
    if (previousNote) confidence += 10;
    if (nextNote) confidence += 5;
    
    if (previousNote && nextNote) {
        const prevNoteNumber = typeof previousNote === 'number' ? previousNote : 
            (typeof previousNote === 'object' ? previousNote.noteNumber : nameToNote(previousNote.note));
        const nextNoteNumber = typeof nextNote === 'number' ? nextNote : 
            (typeof nextNote === 'object' ? nextNote.noteNumber : nameToNote(nextNote.note));
        
        if (Math.abs(noteNumber - prevNoteNumber) <= 2 && 
            Math.abs(nextNoteNumber - noteNumber) <= 2) {
            confidence += 10;
        }
    }
    
    return Math.min(confidence, 100);
}

function generateFingerReason(noteNumber, previousNote, nextNote, finger, hand) {
    const noteName = noteToName(noteNumber);
    const isBlack = isBlackKey(noteNumber);
    
    if (isBlack) {
        return `${noteName}是黑键，建议使用${finger}指弹奏`;
    }
    
    if (previousNote) {
        const prevNoteNumber = typeof previousNote === 'number' ? previousNote : 
            (typeof previousNote === 'object' ? previousNote.noteNumber : nameToNote(previousNote.note));
        const diff = noteNumber - prevNoteNumber;
        
        if (diff > 2 && previousNote.finger === 3) {
            return `从${noteToName(prevNoteNumber)}上行到${noteName}，使用穿指动作（1指从3指下穿过）`;
        }
        if (diff < -2 && previousNote.finger === 1) {
            return `从${noteToName(prevNoteNumber)}下行到${noteName}，使用跨指动作`;
        }
        if (Math.abs(diff) <= 2) {
            return `${noteName}与前一个音符相邻，使用${finger}指顺指弹奏`;
        }
    }
    
    return `${noteName}建议使用${finger}指`;
}

function getFingerTransitionTip(prevNote, currentNote, prevFinger, currentFinger, hand) {
    const semitoneDiff = currentNote - prevNote;
    
    if (semitoneDiff > 2 && prevFinger === 3 && currentFinger === 1) {
        return '穿指动作：将拇指从其他手指下方穿过，保持手腕平稳';
    }
    if (semitoneDiff < -2 && prevFinger === 1 && currentFinger > 2) {
        return '跨指动作：将其他手指从拇指上方跨过，注意手臂不要抬高';
    }
    if (Math.abs(semitoneDiff) === 0 && prevFinger !== currentFinger) {
        return '同音换指：在保持琴键按下的同时，安静地切换手指';
    }
    if (Math.abs(semitoneDiff) > 7) {
        return '大跨度跳跃：提前移动整个手臂和手腕，眼睛先看目标位置';
    }
    if (Math.abs(semitoneDiff) === 5) {
        return '纯五度：注意手指的张开度，保持自然的手型';
    }
    
    return null;
}

function getPreparationTip(currentNote, nextNote, currentFinger, hand) {
    const semitoneDiff = nextNote - currentNote;
    
    if (semitoneDiff > 2 && currentFinger >= 3) {
        const nextFinger = 1;
        return `准备穿指：弹完当前音后，提前将${nextFinger}指移动到下一个音符位置`;
    }
    if (Math.abs(semitoneDiff) > 5) {
        return '准备跳跃：弹完当前音后，快速将手移动到下一个位置';
    }
    
    return null;
}

function analyzeRealTimeNote(playedNote, expectedNote, context = {}) {
    const playedNoteNumber = typeof playedNote === 'number' ? playedNote : nameToNote(playedNote);
    const expectedNoteNumber = typeof expectedNote === 'object' 
        ? expectedNote.noteNumber 
        : typeof expectedNote === 'number' 
            ? expectedNote 
            : nameToNote(expectedNote);
    
    const isCorrect = playedNoteNumber === expectedNoteNumber;
    
    const result = {
        correct: isCorrect,
        played: playedNoteNumber,
        playedName: noteToName(playedNoteNumber),
        expected: expectedNoteNumber,
        expectedName: noteToName(expectedNoteNumber),
        feedback: null,
        fingerSuggestion: null
    };

    if (isCorrect) {
        result.feedback = {
            type: 'success',
            message: `正确！${noteToName(playedNoteNumber)} 弹得很好`
        };
    } else {
        const diff = Math.abs(playedNoteNumber - expectedNoteNumber);
        let errorType = 'general';
        let hint = '';
        
        if (diff === 12) {
            errorType = 'octave';
            hint = '注意看音符的八度位置';
        } else if (diff === 1 || diff === 2) {
            errorType = 'adjacent';
            hint = '注意手指的准确位置';
        } else if (isBlackKey(expectedNoteNumber) && !isBlackKey(playedNoteNumber)) {
            errorType = 'blackKey';
            hint = '这是一个黑键（升降号）';
        } else if (!isBlackKey(expectedNoteNumber) && isBlackKey(playedNoteNumber)) {
            errorType = 'whiteKey';
            hint = '这是一个白键（没有升降号）';
        }
        
        result.feedback = {
            type: 'error',
            errorType,
            message: `错误：弹了 ${noteToName(playedNoteNumber)}，应该弹 ${noteToName(expectedNoteNumber)}`,
            hint
        };
    }

    if (context.expectedFinger) {
        result.fingerSuggestion = {
            recommended: context.expectedFinger,
            fingerName: getFingerName(context.expectedFinger)
        };
    }

    return result;
}

function getFingerName(finger) {
    const names = ['', '大拇指', '食指', '中指', '无名指', '小指'];
    return names[finger] || `${finger}指`;
}

module.exports = {
    analyzePerformance,
    getFingerSuggestions,
    analyzeRealTimeNote,
    noteToName,
    nameToNote,
    isBlackKey,
    getFingerName
};
