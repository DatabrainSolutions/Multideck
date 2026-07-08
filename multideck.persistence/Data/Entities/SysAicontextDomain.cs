using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAicontextDomain
{
    public string AicdCode { get; set; } = null!;

    public string AicdName { get; set; } = null!;

    public string? AicdDescription { get; set; }

    public int AicdSortOrder { get; set; }

    public bool AicdIsActive { get; set; }

    public DateTime AicdCreatedAt { get; set; }

    public virtual ICollection<AiContextItem> AiContextItems { get; set; } = new List<AiContextItem>();

    public virtual ICollection<AiContextRule> AiContextRules { get; set; } = new List<AiContextRule>();

    public virtual ICollection<AiContextStore> AiContextStores { get; set; } = new List<AiContextStore>();

    public virtual ICollection<AiConversation> AiConversations { get; set; } = new List<AiConversation>();

    public virtual ICollection<AiTrainingDataset> AiTrainingDatasets { get; set; } = new List<AiTrainingDataset>();

    public virtual ICollection<AiTrainingItem> AiTrainingItems { get; set; } = new List<AiTrainingItem>();
}
