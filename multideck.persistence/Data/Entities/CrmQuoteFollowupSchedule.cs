using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuoteFollowupSchedule
{
    public Guid CrmqfscheduleId { get; set; }

    public Guid CrmqfscheduleFollowupId { get; set; }

    public int CrmqfscheduleSequenceNo { get; set; }

    public DateTime CrmqfscheduleDueAt { get; set; }

    public string? CrmqfscheduleChannelCode { get; set; }

    public string? CrmqfscheduleActionTypeCode { get; set; }

    public string CrmqfscheduleStatus { get; set; } = null!;

    public Guid? CrmqfscheduleWorkflowTaskId { get; set; }

    public DateTime? CrmqfscheduleCompletedAt { get; set; }

    public DateTime CrmqfscheduleCreatedAt { get; set; }

    public virtual SysCrmnextBestActionType? CrmqfscheduleActionTypeCodeNavigation { get; set; }

    public virtual CrmQuoteFollowup CrmqfscheduleFollowup { get; set; } = null!;

    public virtual WorkflowTask? CrmqfscheduleWorkflowTask { get; set; }
}
