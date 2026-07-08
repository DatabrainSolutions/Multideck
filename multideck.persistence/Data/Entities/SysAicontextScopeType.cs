using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAicontextScopeType
{
    public string AicstCode { get; set; } = null!;

    public string AicstName { get; set; } = null!;

    public string? AicstDescription { get; set; }

    public int AicstPriority { get; set; }

    public bool AicstIsActive { get; set; }

    public DateTime AicstCreatedAt { get; set; }

    public virtual ICollection<AiContextRule> AiContextRules { get; set; } = new List<AiContextRule>();

    public virtual ICollection<AiContextStoreScope> AiContextStoreScopes { get; set; } = new List<AiContextStoreScope>();

    public virtual ICollection<AiContextStore> AiContextStores { get; set; } = new List<AiContextStore>();

    public virtual ICollection<AiTrainingDataset> AiTrainingDatasets { get; set; } = new List<AiTrainingDataset>();

    public virtual ICollection<AiTrainingItem> AiTrainingItems { get; set; } = new List<AiTrainingItem>();
}
