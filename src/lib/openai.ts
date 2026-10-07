import OpenAI from 'openai';
import { getStudents, getLessons, addPayment, setLessonStatusDirect, updateLessonTime } from './storage';
import { getTashkentTodayStr, getTashkentNow } from './formatters';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function processWithAI(text: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return '❌ Ключ OPENAI_API_KEY не настроен в файле .env (добавьте его, чтобы ИИ заработал).';
  }

  // 1. Собираем контекст для ИИ (список учеников и уроков на сегодня)
  const students = await getStudents();
  const lessons = await getLessons();
  const today = getTashkentTodayStr();
  
  const todayLessons = lessons.filter(l => l.date.startsWith(today));

  const studentsContext = students.map(s => `${s.name} (ID: ${s.id}, Баланс: ${s.prepaid_balance} уроков)`).join('\n');
  const lessonsContext = todayLessons.map(l => `Урок с ${l.student_name} в ${l.time_str} (ID урока: ${l.id}, Статус: ${l.status})`).join('\n');

  const systemPrompt = `
Ты - умный ассистент репетитора (Tutor Tracker). Твоя задача помогать управлять CRM системой.
Сегодня: ${today}, Текущее время: ${getTashkentNow().toISOString()}.

Список учеников (ID и балансы):
${studentsContext || 'Нет учеников'}

Уроки на сегодня:
${lessonsContext || 'Нет запланированных уроков'}

Инструкции:
1. Если пользователь просит добавить оплату, отменить или перенести урок - используй доступные функции.
2. Если ты вызываешь функцию, ты должен ответить пользователю коротко и понятно (с эмодзи), что действие выполнено.
3. Если функция не нужна, просто ответь на вопрос как дружелюбный ассистент.
  `;

  const tools = [
    {
      type: "function",
      function: {
        name: "addPayment",
        description: "Добавляет оплату ученику (пополняет баланс уроков). Используй, когда репетитор говорит 'Алина скинула за 10 уроков' и т.д.",
        parameters: {
          type: "object",
          properties: {
            studentId: { type: "string", description: "ID ученика из списка выше" },
            lessonsCount: { type: "number", description: "Количество оплаченных уроков" },
            amountUzs: { type: "number", description: "Сумма в сумах (если не указано явно, можешь не передавать или рассчитать как цена * кол-во)" }
          },
          required: ["studentId", "lessonsCount"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "updateLessonStatus",
        description: "Изменяет статус сегодняшнего урока (проведен, отменен, сгорел).",
        parameters: {
          type: "object",
          properties: {
            lessonId: { type: "string", description: "ID урока из списка сегодняшних уроков" },
            status: { 
                type: "string", 
                enum: ["completed", "missed_excused", "missed_penalty"], 
                description: "completed - урок успешно проведен. missed_excused - отмена по уважительной причине (долг). missed_penalty - отмена без причины (урок сгорает из баланса)." 
            }
          },
          required: ["lessonId", "status"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "rescheduleLesson",
        description: "Изменяет время сегодняшнего урока.",
        parameters: {
          type: "object",
          properties: {
            lessonId: { type: "string", description: "ID урока" },
            newTimeStr: { type: "string", description: "Новое время в формате 'HH:MM - HH:MM', например '15:00 - 16:30'" }
          },
          required: ["lessonId", "newTimeStr"]
        }
      }
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // быстрый и дешевый
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      tools: tools as any,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;

    // Если ИИ решил вызвать функцию (Tool Call)
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      const args = JSON.parse(toolCall.function.arguments);

      if (toolCall.function.name === 'addPayment') {
        const student = students.find(s => s.id === args.studentId);
        const amount = args.amountUzs || (student ? student.price_per_lesson * args.lessonsCount : 0);
        await addPayment(args.studentId, amount, args.lessonsCount);
      } else if (toolCall.function.name === 'updateLessonStatus') {
        await setLessonStatusDirect(args.lessonId, args.status);
      } else if (toolCall.function.name === 'rescheduleLesson') {
        await updateLessonTime(args.lessonId, args.newTimeStr);
      }

      // Отправляем результат выполнения обратно в ИИ, чтобы он сформировал человечный ответ
      const secondResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
          message,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: "✅ Функция успешно выполнена в базе данных."
          }
        ]
      });

      return secondResponse.choices[0].message.content || "Действие успешно выполнено!";
    }

    // Если ИИ просто ответил текстом
    return message.content || "Извини, я не понял.";

  } catch (e: any) {
    console.error("OpenAI AI Error:", e);
    return "❌ Произошла ошибка при обращении к ИИ: " + e.message;
  }
}
