using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmMessageRepetitionRisk
{
    public Guid? CrmpvarCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public Guid? CrmpvarUserId { get; set; }

    public string? CrmpvarMessageIntentCode { get; set; }

    public string? CrmpvarChannelCode { get; set; }

    public string? CrmpvarBodyHashSha256 { get; set; }

    public long? RepeatedDraftCount { get; set; }

    public long? RepeatedSentCount { get; set; }

    public DateTime? LastUsedAt { get; set; }

    public string? BodyPreview { get; set; }
}
