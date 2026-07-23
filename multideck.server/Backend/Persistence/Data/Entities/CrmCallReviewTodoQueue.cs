using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCallReviewTodoQueue
{
    public Guid? CrmquickTaskId { get; set; }

    public Guid? CrmquickTaskCallReviewId { get; set; }

    public Guid? CrmcallReviewCommCallId { get; set; }

    public string? CommCallProviderCallId { get; set; }

    public DateTime? CommCallStartedAt { get; set; }

    public string? CommCallAisummary { get; set; }

    public string? CrmcallReviewAisummary { get; set; }

    public Guid? CrmquickTaskAssignedUserId { get; set; }

    public string? CrmquickTaskTitle { get; set; }

    public DateTime? CrmquickTaskDueAt { get; set; }

    public long? OptionCount { get; set; }
}
