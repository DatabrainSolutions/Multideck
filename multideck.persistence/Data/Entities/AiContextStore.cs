using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiContextStore
{
    public Guid AicsId { get; set; }

    public string AicsName { get; set; } = null!;

    public string? AicsDescription { get; set; }

    public string? AicsDomainCode { get; set; }

    public string? AicsDefaultScopeType { get; set; }

    public Guid? AicsEmbeddingModelId { get; set; }

    public string AicsAccessPolicyJson { get; set; } = null!;

    public bool AicsIsActive { get; set; }

    public DateTime AicsCreatedAt { get; set; }

    public Guid? AicsCreatedBy { get; set; }

    public DateTime AicsUpdatedAt { get; set; }

    public Guid? AicsUpdatedBy { get; set; }

    public virtual ICollection<AiContextItem> AiContextItems { get; set; } = new List<AiContextItem>();

    public virtual ICollection<AiContextStoreScope> AiContextStoreScopes { get; set; } = new List<AiContextStoreScope>();

    public virtual SysAicontextScopeType? AicsDefaultScopeTypeNavigation { get; set; }

    public virtual SysAicontextDomain? AicsDomainCodeNavigation { get; set; }

    public virtual AiModel? AicsEmbeddingModel { get; set; }
}
