using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuickTaskOptionQueue
{
    public Guid? CrmquickOptId { get; set; }

    public Guid? CrmquickOptQuickTaskId { get; set; }

    public Guid? CrmquickTaskAssignedUserId { get; set; }

    public string? CrmquickTaskTitle { get; set; }

    public string? CrmquickOptOptionTypeCode { get; set; }

    public string? CrmquickOptTypeName { get; set; }

    public string? CrmquickOptLabel { get; set; }

    public string? CrmquickOptChannelCode { get; set; }

    public Guid? CrmquickOptMessageDraftId { get; set; }

    public string? CrmpmsgSubject { get; set; }

    public string? CrmpmsgBodyText { get; set; }

    public string? CrmquickOptTargetTable { get; set; }

    public Guid? CrmquickOptTargetId { get; set; }

    public string? CrmquickOptDecisionStatusCode { get; set; }

    public bool? CrmquickOptIsRecommended { get; set; }

    public int? CrmquickOptSortOrder { get; set; }
}
