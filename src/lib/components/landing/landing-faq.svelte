<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import { m } from '$lib/paraglide/messages.js';

	const items = [
		{ id: 'free', question: m.landing_faq_free_question, answer: m.landing_faq_free_answer },
		{ id: 'edit', question: m.landing_faq_edit_question, answer: m.landing_faq_edit_answer },
		{
			id: 'sharing',
			question: m.landing_faq_sharing_question,
			answer: m.landing_faq_sharing_answer
		},
		{
			id: 'languages',
			question: m.landing_faq_languages_question,
			answer: m.landing_faq_languages_answer
		}
	];
</script>

<section id="faq" class="scroll-mt-20 px-4 py-20 sm:px-6">
	<div class="mx-auto max-w-2xl">
		<h2 class="text-center text-3xl font-bold tracking-tight text-balance sm:text-4xl">
			{m.landing_faq_title()}
		</h2>
		<Accordion.Root type="single" class="mt-8">
			{#each items as item (item.id)}
				<Accordion.Item value={item.id}>
					<Accordion.Trigger>{item.question()}</Accordion.Trigger>
					<Accordion.Content>{item.answer()}</Accordion.Content>
				</Accordion.Item>
			{/each}
		</Accordion.Root>
	</div>
</section>
