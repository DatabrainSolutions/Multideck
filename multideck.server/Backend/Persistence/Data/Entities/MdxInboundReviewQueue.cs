using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxInboundReviewQueue
{
    public Guid? MdxreviewId { get; set; }

    public Guid? MdxreviewSharedJobId { get; set; }

    public string? MdxsharedJobLocalJobNumberSnapshot { get; set; }

    public string? MdxsharedJobRemoteJobNumber { get; set; }

    public string? MdxreviewPeerName { get; set; }

    public Guid? MdxreviewEventId { get; set; }

    public string? MdxreviewDataScopeCode { get; set; }

    public string? MdxreviewStatusCode { get; set; }

    public string? MdxreviewTitle { get; set; }

    public string? MdxreviewDescription { get; set; }

    public string? MdxreviewTargetTable { get; set; }

    public Guid? MdxreviewTargetId { get; set; }

    public Guid? MdxreviewAssignedUserId { get; set; }

    public string? MdxreviewAssignedUserEmail { get; set; }

    public DateTime? MdxreviewCreatedAt { get; set; }
}
